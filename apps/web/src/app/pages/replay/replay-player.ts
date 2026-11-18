import { DOCUMENT } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  type OnDestroy,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MONSTER_NAMES, type BattleEvent } from '@tbca/game-core';
import type { FightCombatantView } from '@tbca/shared';

import { LanguageService } from '../../core/language.service';
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
  imports: [TranslocoDirective],
  templateUrl: './replay-player.html',
  styleUrl: './replay-player.css',
})
export class ReplayPlayer implements OnDestroy {
  private readonly language = inject(LanguageService);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly transloco = inject(TranslocoService);

  readonly fight = input.required<ReplayData>();
  /** Team, das als „eigenes“ unten bzw. links erscheint. */
  readonly ownTeam = input(0);

  protected readonly speeds = SPEEDS;
  protected readonly frameIndex = signal(0);
  protected readonly playing = signal(false);
  protected readonly speed = signal<(typeof SPEEDS)[number]>(1);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly frames = computed(() => buildFrames(this.fight().teams, this.fight().events));
  protected readonly frame = computed(() => this.frames()[this.frameIndex()]!);
  protected readonly atEnd = computed(() => this.frameIndex() >= this.frames().length - 1);
  /** Gegner oben bzw. rechts, eigenes Team unten bzw. links. */
  protected readonly teamOrder = computed(() => {
    const teams = this.fight().teams.map((members, index) => ({ index, members }));
    const own = teams.filter((t) => t.index === this.ownTeam());
    return [...teams.filter((t) => t.index !== this.ownTeam()), ...own];
  });

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
    };
  });

  protected readonly log = computed(() => {
    const f = this.formatters();
    return toLogLines(this.fight().events, f.name, f.teamName, f.factor);
  });

  /** Beschriftung des aktuellen Abschnitts (Aktion oder Ergebnis). */
  protected readonly caption = computed<LogLine | null>(() => {
    const f = this.formatters();
    for (const e of this.frame().events) {
      const line = toLogLine(e, f.name, f.teamName, f.factor);
      if (line && line.tone !== 'round') return line;
    }
    return null;
  });

  constructor() {
    // Neues Replay: von vorn, automatisch abspielen.
    // Nur vom Kampf abhängig; play() liest weitere Signale, die das Effect nicht auslösen dürfen.
    effect(() => {
      this.fight();
      untracked(() => {
        this.frameIndex.set(0);
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

  protected setSpeed(speed: (typeof SPEEDS)[number]): void {
    this.speed.set(speed);
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (!this.playing()) return;
    if (this.atEnd()) {
      this.playing.set(false);
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
