import { DOCUMENT } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  type OnDestroy,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { BASIC_ATTACK, MONSTER_NAMES, type BattleEvent } from '@tbca/game-core';
import type { FightCombatantView } from '@tbca/shared';

import { GameConfigService } from '../../core/game-config.service';
import { LanguageService } from '../../core/language.service';
import { SoundService } from '../../core/sound.service';
import { Bar } from '../../shared/ui/bar';
import { ClassBadge } from '../../shared/ui/class-badge';
import { SilhouetteFigure } from '../../shared/ui/silhouette';
import { toLogLine, toLogLines, translateLine, type LogLine } from '../../shared/battle-log';
import { buildFrames } from './replay-state';

export interface ReplayData {
  teams: FightCombatantView[][];
  events: BattleEvent[];
}

const SPEEDS = [1, 2, 4] as const;
const FRAME_MS = 750;

/**
 * HUD-Replay (Spezifikation, Abschnitt 6): Lebens- und Energiebalken, Schadenszahlen, Status und
 * Glitch-Treffer, dazu der vollständige Kampfverlauf als Text für Screenreader.
 */
@Component({
  selector: 'tbca-replay-player',
  imports: [TranslocoDirective, Bar, ClassBadge, SilhouetteFigure],
  templateUrl: './replay-player.html',
  styleUrl: './replay-player.css',
})
export class ReplayPlayer implements OnDestroy {
  private readonly language = inject(LanguageService);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly transloco = inject(TranslocoService);
  private readonly gameConfig = inject(GameConfigService);
  private readonly sound = inject(SoundService);

  readonly fight = input.required<ReplayData>();
  /** Team, das als „eigenes“ unten bzw. links erscheint. */
  readonly ownTeam = input(0);
  /** Starttempo, z. B. 2 für den Dungeon, wo der Kampf nur kurz verfolgt wird. */
  readonly startSpeed = input<(typeof SPEEDS)[number]>(1);
  /** Meldet, wenn die automatische Wiedergabe das Ende erreicht hat. */
  readonly finished = output<void>();

  protected readonly speeds = SPEEDS;
  protected readonly frameIndex = signal(0);
  protected readonly playing = signal(false);
  protected readonly speed = signal<(typeof SPEEDS)[number]>(1);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly frames = computed(() => buildFrames(this.fight().teams, this.fight().events));
  protected readonly frame = computed(() => this.frames()[this.frameIndex()]!);
  /** Zustand vor diesem Abschnitt, für den Nachlauf der HP-Balken. */
  protected readonly previous = computed(() => this.frames()[Math.max(0, this.frameIndex() - 1)]!);
  protected readonly logOpen = signal(false);
  protected readonly atEnd = computed(() => this.frameIndex() >= this.frames().length - 1);
  private readonly names = computed(() => {
    const map = new Map<string, string>();
    this.language.current(); // Monsternamen bei Sprachwechsel neu übersetzen
    for (const c of this.fight().teams.flat()) map.set(c.id, this.displayName(c));
    return map;
  });

  private readonly formatters = computed(() => {
    const locale = this.language.current();
    return {
      name: (id: string) => this.names().get(id) ?? id,
      teamName: (team: number) =>
        this.fight()
          .teams[team]?.map((c) => c.name)
          .join(', ') ?? '',
      factor: (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 }),
      size: (team: number) => this.fight().teams[team]?.length ?? 1,
    };
  });

  protected readonly log = computed(() => {
    const f = this.formatters();
    return toLogLines(this.fight().events, f.name, f.teamName, f.factor, f.size);
  });

  /** Beschriftung je Abschnitt (Aktion oder Ergebnis), für Kopfzeile und Kurzlog. */
  private readonly captions = computed(() => {
    const f = this.formatters();
    return this.frames().map((frame) => {
      for (const e of frame.events) {
        const line = toLogLine(e, f.name, f.teamName, f.factor, f.size);
        if (line && line.tone !== 'round') return line;
      }
      return null;
    });
  });

  /** Die letzten vier Beschriftungen bis zum aktuellen Abschnitt. */
  protected readonly recentLines = computed(() => {
    const out: { line: LogLine; current: boolean }[] = [];
    const captions = this.captions();
    for (let i = this.frameIndex(); i >= 0 && out.length < 4; i--) {
      const line = captions[i];
      if (line) out.unshift({ line, current: i === this.frameIndex() });
    }
    return out;
  });

  /** Aktion des Abschnitts: Fähigkeit und wer sie einsetzt. */
  protected readonly action = computed(() => {
    for (const e of this.frame().events) {
      if (e.type === 'action') return { actor: e.source, ability: e.ability };
      if (e.type === 'stunned') return { actor: e.id, ability: 'stunned' };
    }
    return null;
  });

  /** Ende: Sieg, Niederlage oder Remis aus Sicht des eigenen Teams. */
  protected readonly ending = computed(() => {
    const end = this.frame().events.find((e) => e.type === 'end');
    if (!end || end.type !== 'end') return null;
    if (end.winner === null) return 'draw';
    return end.winner === this.ownTeam() ? 'won' : 'lost';
  });

  /** Reihenfolge der Züge in dieser Runde (nach erstem Auftreten). */
  protected readonly turnOrder = computed(() => {
    const round = this.frame().round;
    const seen: string[] = [];
    for (const frame of this.frames()) {
      if (frame.round !== round || !frame.actor || seen.includes(frame.actor)) continue;
      seen.push(frame.actor);
    }
    return seen;
  });

  /** Fähigkeiten des eigenen ersten Kämpfers mit Abklingzeit zum aktuellen Abschnitt. */
  protected readonly cooldowns = computed(() => {
    const me = this.fight().teams[this.ownTeam()]?.[0];
    if (!me) return [];
    const used = new Map<string, number>();
    const frames = this.frames();
    const now = this.frameIndex();
    for (let i = 0; i <= now; i++) {
      for (const e of frames[i]!.events) {
        if (e.type === 'action' && e.source === me.id && e.ability !== BASIC_ATTACK) {
          used.set(e.ability, frames[i]!.round);
        }
      }
    }
    const config = this.gameConfig.current()?.game;
    const ids = config
      ? config.abilities.filter((a) => a.classId === me.classId).map((a) => a.id)
      : [...used.keys()];
    const current = this.action();
    const round = this.frame().round;
    return ids
      .filter((id) => used.has(id) || config)
      .slice(0, 6)
      .map((id) => {
        const cooldown = config?.abilities.find((a) => a.id === id)?.cooldown ?? 0;
        const last = used.get(id);
        const left = last === undefined ? 0 : Math.max(0, last + cooldown - round);
        const now = current?.actor === me.id && current.ability === id;
        return { id, state: now ? 'now' : left > 0 ? 'cd' : 'ready', left };
      });
  });

  /** Beschriftung des aktuellen Abschnitts (Aktion oder Ergebnis). */
  protected readonly caption = computed<LogLine | null>(() => {
    const f = this.formatters();
    for (const e of this.frame().events) {
      const line = toLogLine(e, f.name, f.teamName, f.factor, f.size);
      if (line && line.tone !== 'round') return line;
    }
    return null;
  });

  constructor() {
    void this.gameConfig.load().catch(() => undefined);
    // Treffer hörbar machen (nur wenn Sound an ist).
    effect(() => {
      const hits = Object.values(this.frame().hit);
      if (hits.length === 0 || !this.playing()) return;
      untracked(() => this.sound.play(hits.includes('crit') ? 'crit' : 'hit'));
    });
    // Neues Replay: von vorn, automatisch abspielen.
    // Nur vom Kampf abhängig; play() liest weitere Signale, die das Effect nicht auslösen dürfen.
    effect(() => {
      this.fight();
      untracked(() => {
        this.frameIndex.set(0);
        this.speed.set(this.startSpeed());
        this.play();
      });
    });
  }

  protected text(
    line: LogLine,
    t: (key: string, params?: Record<string, unknown>) => string,
  ): string {
    return translateLine(line, t);
  }

  /** Monster tragen einen Übersetzungsschlüssel als Namen, Charaktere ihren eigenen. */
  protected displayName(c: { name: string; classId: string | null }): string {
    return c.classId === null && ([...MONSTER_NAMES, 'warden'] as string[]).includes(c.name)
      ? this.transloco.translate(`monsters.${c.name}`)
      : c.name;
  }

  protected percent(value: number, max: number): number {
    return max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  }

  protected play(): void {
    if (this.atEnd()) this.frameIndex.set(0);
    this.playing.set(true);
    this.schedule();
  }

  protected pause(): void {
    this.playing.set(false);
    clearTimeout(this.timer);
  }

  protected toEnd(): void {
    this.pause();
    this.frameIndex.set(this.frames().length - 1);
  }

  protected restart(): void {
    this.frameIndex.set(0);
    this.play();
  }

  /** Eigenes Team links, Gegner rechts. */
  protected readonly teamOrderLr = computed(() => {
    const teams = this.fight().teams.map((members, index) => ({ index, members }));
    return [
      ...teams.filter((t) => t.index === this.ownTeam()),
      ...teams.filter((t) => t.index !== this.ownTeam()),
    ];
  });

  protected readonly ownName = computed(() => {
    const me = this.fight().teams[this.ownTeam()]?.[0];
    return me ? this.displayName(me) : '';
  });

  protected nameOf(id: string): string {
    return this.names().get(id) ?? id;
  }

  protected isOwn(id: string): boolean {
    return this.fight().teams[this.ownTeam()]?.some((c) => c.id === id) ?? false;
  }

  protected step(delta: 1 | -1): void {
    this.pause();
    this.frameIndex.update((i) => Math.max(0, Math.min(this.frames().length - 1, i + delta)));
  }

  /** Name einer Fähigkeit (oder „betäubt“) für die große Mitte. */
  protected abilityName(id: string, t: (k: string) => string): string {
    if (id === 'stunned') return t('replay.stunned');
    return t('abilities.' + id);
  }

  protected tint(team: number): string {
    return team === this.ownTeam() ? '#00F0FF' : '#FF2A6D';
  }

  protected setSpeed(speed: (typeof SPEEDS)[number]): void {
    this.speed.set(speed);
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (!this.playing()) return;
    if (this.atEnd()) {
      this.playing.set(false);
      this.finished.emit();
      return;
    }
    this.timer = setTimeout(() => {
      this.frameIndex.update((i) => i + 1);
      this.schedule();
    }, FRAME_MS / this.speed());
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  protected reducedMotion(): boolean {
    return this.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }
}
