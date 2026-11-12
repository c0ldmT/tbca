import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type {
  TeamLeaderboardEntry,
  TeamLeagueMatchView,
  TeamLeagueView,
  TeamView,
} from '@tbca/shared';

import { ApiFailure } from '../../core/api-failure';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { LeagueService } from '../../core/league.service';
import { SoundService } from '../../core/sound.service';
import { TeamService } from '../../core/team.service';
import { Segments } from '../../shared/ui/segments';
import { TeamLogo } from '../../shared/ui/team-logo';

interface Matchday {
  matchday: number;
  playAt: string;
  matches: TeamLeagueMatchView[];
}

/**
 * Team-Liga im Crew-Hub: Rating je Größe, Anmeldung durch den Kapitän, Division mit Tabelle und
 * Spielplan, Team-Rangliste. Platziert wird über gewertete Team-Kämpfe.
 */
@Component({
  selector: 'tbca-team-league-page',
  imports: [TranslocoDirective, RouterLink, TeamLogo, Segments],
  templateUrl: './team-league.page.html',
  styleUrls: ['../league/league.page.css', './team-league.page.css'],
})
export class TeamLeaguePage {
  private readonly auth = inject(AuthService);
  private readonly teamsApi = inject(TeamService);
  private readonly api = inject(LeagueService);
  private readonly language = inject(LanguageService);
  private readonly sound = inject(SoundService);

  protected readonly teams = signal<TeamView[] | null>(null);
  protected readonly teamId = signal<string | null>(null);
  protected readonly size = signal<2 | 3>(2);
  protected readonly view = signal<TeamLeagueView | null>(null);
  protected readonly board = signal<TeamLeaderboardEntry[] | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly placed = computed(() => (this.view()?.rating?.placementLeft ?? 1) === 0);
  protected readonly myId = computed(() => this.teamId());
  protected readonly matchdays = computed<Matchday[]>(() => {
    const out = new Map<number, Matchday>();
    for (const m of this.view()?.division?.matches ?? []) {
      const day = out.get(m.matchday) ?? { matchday: m.matchday, playAt: m.playAt, matches: [] };
      day.matches.push(m);
      out.set(m.matchday, day);
    }
    return [...out.values()].sort((a, b) => a.matchday - b.matchday);
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      if (this.auth.state() === undefined) await this.auth.refresh();
      if (!this.auth.user()) return;
      const teams = await this.teamsApi.mine();
      this.teams.set(teams);
      if (!this.teamId() && teams[0]) this.teamId.set(teams[0].id);
      await this.refresh();
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    }
  }

  protected async refresh(): Promise<void> {
    const id = this.teamId();
    try {
      const [view, board] = await Promise.all([
        id ? this.api.teamView(id, this.size()) : Promise.resolve(null),
        this.api.teamLeaderboard(this.size()),
      ]);
      this.view.set(view);
      this.board.set(board);
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    }
  }

  protected async pickTeam(id: string): Promise<void> {
    this.teamId.set(id);
    await this.refresh();
  }

  protected async pickSize(size: 2 | 3): Promise<void> {
    this.size.set(size);
    this.view.set(null);
    this.board.set(null);
    await this.refresh();
  }

  protected async join(joined: boolean): Promise<void> {
    const id = this.teamId();
    if (!id) return;
    this.sound.play('click');
    this.busy.set(true);
    this.error.set(null);
    try {
      this.view.set(await this.api.teamJoin(id, this.size(), joined));
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }

  protected outcome(m: TeamLeagueMatchView): 'win' | 'loss' | 'draw' | 'other' {
    if (m.draw) return 'draw';
    const me = this.myId();
    if (me !== m.a?.id && me !== m.b?.id) return 'other';
    return m.winnerId === me ? 'win' : 'loss';
  }

  protected mine(m: TeamLeagueMatchView): boolean {
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
