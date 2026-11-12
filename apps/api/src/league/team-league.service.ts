import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ENGINE_VERSION,
  levelFromXp,
  pvpReward,
  simulateBattle,
  standings,
  type Clock,
  type CombatantSnapshot,
  type StandingRow,
} from '@tbca/game-core';
import type {
  LeagueTickResult,
  LeagueView,
  TeamLeaderboardEntry,
  TeamLeagueMatchView,
  TeamLeagueRef,
  TeamLeagueView,
} from '@tbca/shared';

import type { CharacterRecord, CharacterRepository } from '../character/types.js';
import { ApiError } from '../common/api-error.js';
import type { Env } from '../config/env.js';
import { dayKey } from '../fight/day.js';
import type { FightRepository } from '../fight/types.js';
import { SeasonService, type CurrentSeason } from '../game/season.js';
import { ProgressionService } from '../progression/progression.service.js';
import { TeamService } from '../team/team.service.js';
import type { TeamRepository } from '../team/types.js';
import {
  CHARACTER_REPOSITORY,
  CLOCK,
  ENV,
  FIGHT_REPOSITORY,
  TEAM_LEAGUE_REPOSITORY,
  TEAM_REPOSITORY,
} from '../tokens.js';
import { GLICKO_START } from './glicko2.js';
import { RatingService } from './rating.service.js';
import { planCycle } from './schedule.js';
import type {
  TeamCycleRecord,
  TeamLeagueRepository,
  TeamMatchRecord,
  TeamMemberRecord,
  TeamRatingRecord,
  TeamSize,
} from './team-types.js';

const SIZES: readonly TeamSize[] = [2, 3];
const MAX_EVENTS_PER_TICK = 500;

type TickCount = Omit<LeagueTickResult, 'teams'>;

/**
 * Team-Liga (Spezifikation, Abschnitt 9): wie die Einzel-Liga, getrennt für 2v2 und 3v3, mit
 * eigenem Glicko-2-Rating je Team und Größe. Der Kapitän meldet an; zum Lock wird die
 * Standard-Aufstellung (sonst die stärksten Mitglieder) mit Team-Fokus eingefroren.
 */
@Injectable()
export class TeamLeagueService {
  constructor(
    @Inject(TEAM_LEAGUE_REPOSITORY) private readonly repo: TeamLeagueRepository,
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(FIGHT_REPOSITORY) private readonly fights: FightRepository,
    @Inject(TeamService) private readonly teamService: TeamService,
    @Inject(RatingService) private readonly ratings: RatingService,
    @Inject(SeasonService) private readonly seasons: SeasonService,
    @Inject(ProgressionService) private readonly progression: ProgressionService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // --- Teams ------------------------------------------------------------------

  async view(accountId: string, teamId: string, size: TeamSize): Promise<TeamLeagueView> {
    const season = await this.seasons.current();
    const team = await this.teams.find(teamId);
    if (!team || !team.members.includes(accountId))
      throw new ApiError(HttpStatus.NOT_FOUND, 'team_not_found', 'Team nicht gefunden');
    const rules = season.game.league;
    const rating = (await this.repo.ratings(season.id, size, [teamId])).get(teamId) ?? null;
    const cycle =
      (await this.repo.activeCycle(season.id, size)) ??
      (await this.repo.lastCycle(season.id, size));
    let division: TeamLeagueView['division'] = null;
    let next: TeamLeagueView['next'] = null;
    if (cycle) {
      const members = await this.repo.members(cycle.id);
      const mine = members.find((m) => m.teamId === teamId);
      if (mine) {
        const matches = await this.repo.matches(cycle.id);
        division = await this.divisionView(season, members, matches, mine.division, teamId);
        const upcoming = matches
          .filter(
            (m) =>
              (m.status === 'scheduled' || m.status === 'locked') &&
              (m.aTeamId === teamId || m.bTeamId === teamId),
          )
          .sort((x, y) => x.playAt.getTime() - y.playAt.getTime())[0];
        if (upcoming)
          next = {
            matchday: upcoming.matchday,
            lockAt: upcoming.lockAt.toISOString(),
            playAt: upcoming.playAt.toISOString(),
            locked: upcoming.status === 'locked',
          };
      }
    }
    return {
      size,
      rating: rating ? ratingView(rating, rules.placementGames) : null,
      joined: rating?.leagueJoined ?? false,
      captain: team.captainAccountId === accountId,
      cycle: cycle
        ? {
            id: cycle.id,
            number: cycle.number,
            status: cycle.status,
            startsAt: cycle.startsAt.toISOString(),
            endsAt: cycle.endsAt.toISOString(),
          }
        : null,
      division,
      next,
      rules: rulesView(season),
    };
  }

  async join(
    accountId: string,
    teamId: string,
    size: TeamSize,
    joined: boolean,
  ): Promise<TeamLeagueView> {
    const season = await this.seasons.current();
    const team = await this.teams.find(teamId);
    if (!team || !team.members.includes(accountId))
      throw new ApiError(HttpStatus.NOT_FOUND, 'team_not_found', 'Team nicht gefunden');
    if (team.captainAccountId !== accountId)
      throw new ApiError(HttpStatus.FORBIDDEN, 'not_captain', 'Nur für den Kapitän');
    await this.repo.setJoined(season.id, size, teamId, joined);
    return this.view(accountId, teamId, size);
  }

  async leaderboard(size: TeamSize, limit: number): Promise<TeamLeaderboardEntry[]> {
    const season = await this.seasons.current();
    const rows = await this.repo.leaderboard(season.id, size, {
      minGames: season.game.league.placementGames,
      limit,
    });
    return rows.map((r, i) => ({
      id: r.teamId,
      name: r.name,
      tag: r.tag,
      logo: r.logo,
      community: r.community,
      place: i + 1,
      rating: Math.round(r.rating),
      rd: Math.round(r.rd),
      games: r.games,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
    }));
  }

  // --- Ablauf -----------------------------------------------------------------

  /** Fällige Termine beider Größen nach Spielzeit abarbeiten (Teil des Jobs „league-tick“). */
  async tick(): Promise<TickCount> {
    const total: TickCount = { locked: 0, played: 0, cyclesStarted: 0, cyclesFinished: 0 };
    for (const size of SIZES) {
      const r = await this.tickSize(size);
      total.locked += r.locked;
      total.played += r.played;
      total.cyclesStarted += r.cyclesStarted;
      total.cyclesFinished += r.cyclesFinished;
    }
    return total;
  }

  private async tickSize(size: TeamSize): Promise<TickCount> {
    const season = await this.seasons.current();
    const now = this.clock.now();
    const result: TickCount = { locked: 0, played: 0, cyclesStarted: 0, cyclesFinished: 0 };
    let cursor: number | null = null;
    for (let i = 0; i < MAX_EVENTS_PER_TICK; i++) {
      const cycle = await this.repo.activeCycle(season.id, size);
      if (!cycle) {
        if (!(await this.startCycle(season, size, cursor ?? now))) break;
        result.cyclesStarted++;
        continue;
      }
      const event = await this.repo.nextEvent(cycle.id);
      if (!event) {
        await this.finishCycle(season, cycle);
        result.cyclesFinished++;
        cursor = cycle.endsAt.getTime();
        continue;
      }
      if (event.at.getTime() > now) break;
      cursor = event.at.getTime();
      if (event.kind === 'lock') result.locked += await this.lockDue(cycle, size, event.at);
      else result.played += await this.playDue(season, cycle, event.at);
    }
    return result;
  }

  private async startCycle(
    season: CurrentSeason,
    size: TeamSize,
    base: number,
  ): Promise<TeamCycleRecord | null> {
    const rules = season.game.league;
    const entrants = await this.repo.entrants(season.id, size, rules.placementGames);
    const last = await this.repo.lastCycle(season.id, size);
    const previous = new Map(
      (last ? await this.repo.members(last.id) : []).map((m) => [m.teamId, m]),
    );
    const plan = planCycle(
      rules,
      entrants.map((e) => ({ id: e.teamId, rating: e.rating })),
      (id) => {
        const p = previous.get(id);
        return p && p.place !== null
          ? { division: p.division, place: p.place, movement: p.movement ?? 'stay' }
          : null;
      },
      base,
      this.env.GAME_TIMEZONE,
    );
    if (!plan) return null;
    const rating = new Map(entrants.map((e) => [e.teamId, e.rating]));
    return this.repo.createCycle({
      seasonId: season.id,
      size,
      number: (last?.number ?? 0) + 1,
      startsAt: plan.startsAt,
      endsAt: plan.endsAt,
      members: plan.divisions.flatMap((ids, division) =>
        ids.map((teamId) => ({
          teamId,
          division,
          ratingAtStart: rating.get(teamId) ?? GLICKO_START.rating,
        })),
      ),
      matches: plan.pairings.map((p) => ({
        division: p.division,
        matchday: p.matchday,
        lockAt: p.lockAt,
        playAt: p.playAt,
        aTeamId: p.a,
        bTeamId: p.b,
        status: p.b === null ? 'bye' : 'scheduled',
      })),
    });
  }

  /** Lock: beide Aufstellungen einfrieren; ein Team ohne volle Aufstellung tritt nicht an. */
  private async lockDue(cycle: TeamCycleRecord, size: TeamSize, at: Date): Promise<number> {
    const due = (await this.repo.matches(cycle.id)).filter(
      (m) => m.status === 'scheduled' && m.lockAt.getTime() <= at.getTime(),
    );
    const lineups = new Map<string, CombatantSnapshot[]>();
    const lineup = async (id: string | null) => {
      if (!id) return [];
      if (!lineups.has(id))
        lineups.set(id, (await this.teamService.lineupSnapshots(id, size)) ?? []);
      return lineups.get(id)!;
    };
    const updates: { id: string; snapshots: CombatantSnapshot[][] }[] = [];
    for (const m of due)
      updates.push({ id: m.id, snapshots: [await lineup(m.aTeamId), await lineup(m.bTeamId)] });
    await this.repo.lockMatches(updates);
    return due.length;
  }

  private async playDue(season: CurrentSeason, cycle: TeamCycleRecord, at: Date): Promise<number> {
    const due = (await this.repo.matches(cycle.id)).filter(
      (m) => m.status === 'locked' && m.playAt.getTime() <= at.getTime(),
    );
    for (const match of due) await this.play(season, cycle.size, match, at);
    return due.length;
  }

  private async play(
    season: CurrentSeason,
    size: TeamSize,
    match: TeamMatchRecord,
    at: Date,
  ): Promise<void> {
    const [sa = [], sb = []] = match.snapshots ?? [];
    const ready = (s: CombatantSnapshot[], id: string | null) => id !== null && s.length > 0;
    if (!ready(sa, match.aTeamId) || !ready(sb, match.bTeamId)) {
      // Nicht antrittsfähig: kampflos für die andere Seite (oder für niemanden)
      const winner = ready(sa, match.aTeamId)
        ? match.aTeamId
        : ready(sb, match.bTeamId)
          ? match.bTeamId
          : null;
      await this.repo.finishMatch(match.id, { fightId: null, winnerTeamId: winner, draw: false });
      return;
    }
    const records = new Map<string, CharacterRecord>();
    for (const s of [...sa, ...sb]) {
      const c = await this.characters.findById(s.id);
      if (c) records.set(c.id, c);
    }
    const result = simulateBattle({
      engineVersion: ENGINE_VERSION,
      configVersion: season.configVersion,
      seed: match.id,
      rules: season.battle,
      teams: [sa, sb],
    });
    const day = dayKey(at.getTime(), this.env.GAME_TIMEZONE);
    const median = await this.progression.median(season.id);
    const avg = (s: CombatantSnapshot[]) =>
      Math.round(s.reduce((sum, c) => sum + c.level, 0) / s.length);
    const rewardFor = (c: CharacterRecord, won: boolean, opponent: CombatantSnapshot[]) =>
      this.progression.boost(
        season.game,
        pvpReward(season.game, {
          mode: 'rated',
          won,
          level: c.level,
          opponentLevel: avg(opponent),
          rewardedToday: 0,
          rewardedVsOpponentToday: 0,
          opponentIsBot: opponent.every((o) => records.get(o.id)?.isBot ?? false),
          testSeason: season.isTest,
        }),
        c.level,
        median,
      );

    const fightId = await this.fights.lockedMany([...records.keys()], async (tx) => {
      const rows: {
        team: number;
        slot: number;
        c: CharacterRecord | undefined;
        id: string;
        won: boolean;
        reward: { xp: number; credits: number };
        opponentTeamId: string | null;
      }[] = [];
      for (const [team, list, opp, oppId] of [
        [0, sa, sb, match.bTeamId],
        [1, sb, sa, match.aTeamId],
      ] as const) {
        const won = result.winner === team;
        list.forEach((s, slot) => {
          const c = records.get(s.id);
          rows.push({
            team,
            slot,
            c,
            id: s.id,
            won,
            reward: c ? rewardFor(c, won, opp) : { xp: 0, credits: 0 },
            opponentTeamId: oppId,
          });
        });
      }
      const id = await tx.insert({
        seasonId: season.id,
        kind: 'team_league',
        seed: match.id,
        configVersion: season.configVersion,
        input: { rules: season.battle, teams: [sa, sb] },
        result,
        rewardDay: day,
        participants: rows.map((r) => ({
          team: r.team,
          slot: r.slot,
          characterId: r.c ? r.id : null,
          initiator: false,
          won: r.won,
          // Liga-Kämpfe zählen nicht für das Tageslimit
          rewarded: false,
          xpAwarded: r.reward.xp,
          creditsAwarded: r.reward.credits,
          opponentCharacterId: null,
          opponentTeamId: r.opponentTeamId,
        })),
      });
      for (const r of rows) {
        if (!r.c) continue;
        if (r.reward.credits > 0)
          await tx.rewardCredits(season.id, r.c.accountId, r.reward.credits, id);
        if (r.reward.xp > 0) {
          const fresh = (await this.characters.findById(r.c.id)) ?? r.c;
          const xp = fresh.xp + r.reward.xp;
          await tx.setProgress(
            r.c.id,
            xp,
            Math.max(fresh.level, levelFromXp(season.game, xp).level),
          );
        }
      }
      return id;
    });
    await this.repo.finishMatch(match.id, {
      fightId,
      winnerTeamId:
        result.winner === 0 ? match.aTeamId : result.winner === 1 ? match.bTeamId : null,
      draw: result.winner === null,
    });
    await this.ratings.recordTeams(
      season.id,
      size,
      match.aTeamId!,
      match.bTeamId!,
      result.winner === null ? null : (result.winner as 0 | 1),
    );
  }

  private async finishCycle(season: CurrentSeason, cycle: TeamCycleRecord): Promise<void> {
    const members = await this.repo.members(cycle.id);
    const matches = await this.repo.matches(cycle.id);
    const count = members.length ? Math.max(...members.map((m) => m.division)) + 1 : 0;
    const rows: { teamId: string; place: number; movement: 'up' | 'down' | 'stay' }[] = [];
    for (let d = 0; d < count; d++)
      for (const row of this.table(
        season,
        members.filter((m) => m.division === d),
        matches.filter((m) => m.division === d),
        d,
        count,
      ))
        rows.push({ teamId: row.characterId, place: row.place, movement: row.movement });
    await this.repo.finishCycle(cycle.id, cycle.endsAt, rows);
  }

  private table(
    season: CurrentSeason,
    members: TeamMemberRecord[],
    matches: TeamMatchRecord[],
    division: number,
    divisions: number,
  ): StandingRow[] {
    return standings(season.game.league, {
      members: members.map((m) => ({ characterId: m.teamId, rating: m.ratingAtStart })),
      results: matches
        .filter((m) => m.status === 'played' && m.aTeamId && m.bTeamId)
        .map((m) => ({ a: m.aTeamId!, b: m.bTeamId!, winner: m.draw ? null : m.winnerTeamId })),
      division,
      divisions,
    });
  }

  private async divisionView(
    season: CurrentSeason,
    members: TeamMemberRecord[],
    allMatches: TeamMatchRecord[],
    index: number,
    mineId: string,
  ): Promise<NonNullable<TeamLeagueView['division']>> {
    const count = Math.max(...members.map((m) => m.division)) + 1;
    const inDivision = members.filter((m) => m.division === index);
    const matches = allMatches.filter((m) => m.division === index);
    const refs = new Map<string, TeamLeagueRef>();
    for (const m of inDivision) {
      const t = await this.teams.find(m.teamId);
      if (t) refs.set(t.id, { id: t.id, name: t.name, tag: t.tag, logo: t.logo });
    }
    return {
      index,
      count,
      table: this.table(season, inDivision, matches, index, count)
        .filter((row) => refs.has(row.characterId))
        .map((row) => ({
          ...refs.get(row.characterId)!,
          place: row.place,
          played: row.played,
          wins: row.wins,
          draws: row.draws,
          losses: row.losses,
          points: row.points,
          movement: row.movement,
          mine: row.characterId === mineId,
        })),
      matches: matches.map((m): TeamLeagueMatchView => ({
        id: m.id,
        matchday: m.matchday,
        lockAt: m.lockAt.toISOString(),
        playAt: m.playAt.toISOString(),
        status: m.status,
        a: m.aTeamId ? (refs.get(m.aTeamId) ?? null) : null,
        b: m.bTeamId ? (refs.get(m.bTeamId) ?? null) : null,
        winnerId: m.winnerTeamId,
        draw: m.draw,
        fightId: m.fightId,
      })),
    };
  }
}

function ratingView(r: TeamRatingRecord, placementGames: number) {
  return {
    rating: Math.round(r.rating),
    rd: Math.round(r.rd),
    games: r.games,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    placementLeft: Math.max(0, placementGames - r.games),
  };
}

export function rulesView(season: CurrentSeason): LeagueView['rules'] {
  const rules = season.game.league;
  return {
    divisionSize: rules.divisionSize,
    promote: rules.promote,
    relegate: rules.relegate,
    lockMinutes: rules.lockMinutes,
    placementGames: rules.placementGames,
    matchday: `${String(rules.matchdayHour).padStart(2, '0')}:${String(rules.matchdayMinute).padStart(2, '0')}`,
    points: { ...rules.points },
  };
}
