import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { LeaderboardEntry, LeagueMatchView, LeagueView } from '@tbca/shared';

type Division = NonNullable<LeagueView['division']>;

import { ApiFailure } from '../../core/api-failure';
import { CharacterService } from '../../core/character.service';
import { LanguageService } from '../../core/language.service';
import { LeagueService } from '../../core/league.service';
import { SoundService } from '../../core/sound.service';
import { ClassBadge } from '../../shared/ui/class-badge';
import { Segments } from '../../shared/ui/segments';

interface Matchday {
  matchday: number;
  playAt: string;
  matches: LeagueMatchView[];
}

/**
 * Liga: Rating und Platzierung, Anmeldung, eigene Division mit Tabelle und Spielplan, Rangliste.
 * Gekämpft wird automatisch zum Spieltag; bis zum Lock zählen Änderungen an Ausrüstung und Taktik.
 */
@Component({
  selector: 'tbca-league-page',
  imports: [TranslocoDirective, RouterLink, ClassBadge, Segments],
  templateUrl: './league.page.html',
  styleUrl: './league.page.css',
})
export class LeaguePage {
  private readonly api = inject(LeagueService);
  private readonly characters = inject(CharacterService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);

  protected readonly view = signal<LeagueView | null>(null);
  protected readonly board = signal<LeaderboardEntry[] | null>(null);
  protected readonly scope = signal<'global' | 'community'>('global');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Angesehene fremde Division; null = die eigene. */
  protected readonly other = signal<Division | null>(null);
  protected readonly shown = computed<Division | null>(
    () => this.other() ?? this.view()?.division ?? null,
  );

  /** Spielplan der eigenen Division nach Spieltagen. */
  protected readonly matchdays = computed<Matchday[]>(() => {
    const out = new Map<number, Matchday>();
    for (const m of this.shown()?.matches ?? []) {
      const day = out.get(m.matchday) ?? { matchday: m.matchday, playAt: m.playAt, matches: [] };
      day.matches.push(m);
      out.set(m.matchday, day);
    }
    return [...out.values()].sort((a, b) => a.matchday - b.matchday);
  });

  protected readonly placed = computed(() => (this.view()?.rating?.placementLeft ?? 1) === 0);
  protected readonly myId = computed(() => this.shown()?.table.find((r) => r.me)?.id ?? null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      if (this.characters.state() === undefined) await this.characters.refresh();
      if (!this.characters.state()) return;
      const [view, board] = await Promise.all([
        this.api.view(),
        this.api.leaderboard(this.scope()),
      ]);
      this.view.set(view);
      this.board.set(board);
      // Ohne eigene Division zeigt die Seite die oberste des laufenden Zyklus
      if (!view.division && view.cycle) await this.showDivision(0);
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    }
  }

  protected async showDivision(index: number): Promise<void> {
    try {
      const own = this.view()?.division;
      if (own && own.index === index) {
        this.other.set(null);
        return;
      }
      this.other.set((await this.api.division(index)).division);
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    }
  }

  protected async setScope(scope: 'global' | 'community'): Promise<void> {
    this.scope.set(scope);
    this.board.set(null);
    try {
      this.board.set(await this.api.leaderboard(scope));
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    }
  }

  protected async join(joined: boolean): Promise<void> {
    this.sound.play('click');
    this.busy.set(true);
    this.error.set(null);
    try {
      this.view.set(await this.api.join(joined));
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }

  protected async placement(): Promise<void> {
    this.sound.play('click');
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.placement();
      void this.characters.refresh().catch(() => undefined);
      await this.router.navigate(['/replay', result.fightId], { state: { result } });
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }

  /** Ergebnis aus eigener Sicht bzw. neutral für fremde Paarungen. */
  protected outcome(m: LeagueMatchView): 'win' | 'loss' | 'draw' | 'open' | 'bye' | 'other' {
    if (m.status === 'bye') return 'bye';
    if (m.status !== 'played') return 'open';
    if (m.draw) return 'draw';
    const me = this.myId();
    if (me !== m.a?.id && me !== m.b?.id) return 'other';
    return m.winnerId === me ? 'win' : 'loss';
  }

  protected mine(m: LeagueMatchView): boolean {
    const me = this.myId();
    return me !== null && (m.a?.id === me || m.b?.id === me);
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleString(this.language.current(), {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString(this.language.current(), {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
