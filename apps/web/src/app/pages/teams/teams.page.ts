import { Component, input, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { TargetSelector } from '@tbca/game-core';
import type { CommunityView, TeamSummary, TeamView } from '@tbca/shared';
import { TEAM_FOCUS, TEAM_LOGOS, TEAM_MAX_MEMBERS } from '@tbca/shared/constants';

import { ApiFailure } from '../../core/api-failure';
import { AuthService } from '../../core/auth.service';
import { CharacterService } from '../../core/character.service';
import { TeamService } from '../../core/team.service';
import { ClassBadge } from '../../shared/ui/class-badge';
import { Segments } from '../../shared/ui/segments';
import { TeamLogo } from '../../shared/ui/team-logo';

@Component({
  selector: 'tbca-teams-page',
  imports: [TranslocoDirective, RouterLink, TeamLogo, ClassBadge, Segments],
  templateUrl: './teams.page.html',
  styleUrl: './teams.page.css',
})
export class TeamsPage {
  /** Abschnitt aus den Routendaten: eigenes Team, Team-Kampf oder Communities. */
  readonly section = input<'team' | 'challenge' | 'communities'>('team');

  protected readonly auth = inject(AuthService);
  protected readonly characters = inject(CharacterService);
  private readonly api = inject(TeamService);
  private readonly router = inject(Router);

  protected readonly logos = TEAM_LOGOS;
  protected readonly focusOptions = TEAM_FOCUS;
  protected readonly maxMembers = TEAM_MAX_MEMBERS;
  protected readonly communities = signal<CommunityView[]>([]);
  protected readonly teams = signal<TeamView[]>([]);
  protected readonly opponents = signal<TeamSummary[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  // Formulare
  protected readonly form = signal({ communityId: '', name: '', tag: '', logo: 'wolf' as string });
  protected readonly code = signal('');
  protected readonly activeTeamId = signal<string | null>(null);
  protected readonly size = signal<2 | 3>(2);
  protected readonly lineup = signal<string[]>([]);

  protected readonly memberCommunities = computed(() => this.communities().filter((c) => c.member));
  protected readonly activeTeam = computed(
    () => this.teams().find((t) => t.id === this.activeTeamId()) ?? this.teams()[0] ?? null,
  );
  protected readonly ready = computed(() => this.lineup().length === this.size());

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    await this.run(async () => {
      if (this.auth.state() === undefined) await this.auth.refresh();
      if (!this.auth.user()) return;
      if (this.characters.state() === undefined) await this.characters.refresh();
      const [communities, teams, opponents] = await Promise.all([
        this.api.communities(),
        this.api.mine(),
        this.api.search(''),
      ]);
      this.communities.set(communities);
      this.setTeams(teams);
      this.opponents.set(opponents);
      const first = communities.find((c) => c.member);
      if (first && !this.form().communityId) this.patchForm({ communityId: first.id });
    });
  }

  /** Durchschnittslevel der Mitglieder mit Charakter (gerundet). */
  protected averageLevel(team: TeamView): number {
    const levels = team.members.flatMap((m) => (m.character ? [m.character.level] : []));
    return levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 0;
  }

  protected patchForm(patch: Partial<ReturnType<typeof this.form>>): void {
    this.form.update((f) => ({ ...f, ...patch }));
  }

  protected joinCommunity(id: string) {
    return this.run(async () => {
      this.communities.set(await this.api.joinCommunity(id));
      if (!this.form().communityId) this.patchForm({ communityId: id });
    });
  }

  protected create() {
    return this.run(async () => {
      this.setTeams(await this.api.create(this.form()));
      this.patchForm({ name: '', tag: '' });
    });
  }

  protected join() {
    return this.run(async () => {
      this.setTeams(await this.api.join(this.code()));
      this.code.set('');
    });
  }

  protected leave(team: TeamView) {
    return this.run(async () => this.setTeams(await this.api.leave(team.id)));
  }

  protected kick(team: TeamView, accountId: string) {
    return this.run(async () => this.setTeams(await this.api.kick(team.id, accountId)));
  }

  protected saveSettings(
    team: TeamView,
    patch: { focus?: TargetSelector; lineup2?: string[]; lineup3?: string[] },
  ) {
    return this.run(async () =>
      this.setTeams(
        await this.api.settings(team.id, {
          focus: patch.focus ?? team.focus,
          lineup2: patch.lineup2 ?? team.lineup2,
          lineup3: patch.lineup3 ?? team.lineup3,
        }),
      ),
    );
  }

  /** Aufstellung als Standard für Herausforderungen gegen das eigene Team speichern. */
  protected saveLineupAsDefault(team: TeamView) {
    return this.saveSettings(
      team,
      this.size() === 2 ? { lineup2: this.lineup() } : { lineup3: this.lineup() },
    );
  }

  protected toggleLineup(accountId: string): void {
    this.lineup.update((l) =>
      l.includes(accountId)
        ? l.filter((x) => x !== accountId)
        : l.length < this.size()
          ? [...l, accountId]
          : l,
    );
  }

  protected setSize(size: 2 | 3): void {
    this.size.set(size);
    this.lineup.update((l) => l.slice(0, size));
  }

  protected search(q: string) {
    return this.run(async () => this.opponents.set(await this.api.search(q)));
  }

  protected challenge(opponent: TeamSummary, mode: 'rated' | 'friendly') {
    const team = this.activeTeam();
    if (!team) return Promise.resolve();
    return this.run(async () => {
      const result = await this.api.challenge(team.id, {
        opponentTeamId: opponent.id,
        size: this.size(),
        lineup: this.lineup(),
        mode,
      });
      void this.characters.refresh().catch(() => undefined);
      await this.router.navigate(['/replay', result.fightId], { state: { teamResult: result } });
    });
  }

  private setTeams(teams: TeamView[]): void {
    this.teams.set(teams);
    const active = this.activeTeam();
    if (!active) return;
    // Vorauswahl: gespeicherte Aufstellung oder die eigenen Mitglieder mit Charakter.
    const preset = this.size() === 2 ? active.lineup2 : active.lineup3;
    const withCharacter = active.members.filter((m) => m.character).map((m) => m.accountId);
    this.lineup.set((preset.length ? preset : withCharacter).slice(0, this.size()));
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }
}
