import {
  community,
  team,
  teamLeagueCycle,
  teamLeagueMatch,
  teamLeagueMember,
  teamRating,
  type Database,
} from '@tbca/db';
import type { CombatantSnapshot } from '@tbca/game-core';
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';

import { GLICKO_START } from './glicko2.js';
import type {
  TeamCycleRecord,
  TeamLeaderboardRow,
  TeamLeagueRepository,
  TeamMatchRecord,
  TeamMemberRecord,
  TeamRatingRecord,
  TeamSize,
} from './team-types.js';

type Row = typeof teamRating.$inferSelect;

const toRating = (r: Row): TeamRatingRecord => ({
  teamId: r.teamId,
  seasonId: r.seasonId,
  size: r.size as TeamSize,
  rating: r.rating,
  rd: r.rd,
  volatility: r.volatility,
  games: r.games,
  wins: r.wins,
  losses: r.losses,
  draws: r.draws,
  leagueJoined: r.leagueJoined,
});

const fresh = (seasonId: string, size: TeamSize, teamId: string) => ({
  teamId,
  seasonId,
  size,
  ...GLICKO_START,
});

const toCycle = (c: typeof teamLeagueCycle.$inferSelect): TeamCycleRecord => ({
  ...c,
  size: c.size as TeamSize,
});

export class DrizzleTeamLeagueRepository implements TeamLeagueRepository {
  constructor(private readonly db: Database) {}

  async ratings(seasonId: string, size: TeamSize, teamIds: readonly string[]) {
    if (teamIds.length === 0) return new Map<string, TeamRatingRecord>();
    const rows = await this.db
      .select()
      .from(teamRating)
      .where(
        and(
          eq(teamRating.seasonId, seasonId),
          eq(teamRating.size, size),
          inArray(teamRating.teamId, [...teamIds]),
        ),
      );
    return new Map(rows.map((r) => [r.teamId, toRating(r)]));
  }

  updateRatings(
    seasonId: string,
    size: TeamSize,
    teamIds: readonly string[],
    update: (current: Map<string, TeamRatingRecord>) => TeamRatingRecord[],
  ): Promise<TeamRatingRecord[]> {
    return this.db.transaction(async (tx) => {
      const ids = [...new Set(teamIds)].sort();
      await tx
        .insert(teamRating)
        .values(ids.map((id) => fresh(seasonId, size, id)))
        .onConflictDoNothing();
      const rows = await tx
        .select()
        .from(teamRating)
        .where(
          and(
            eq(teamRating.seasonId, seasonId),
            eq(teamRating.size, size),
            inArray(teamRating.teamId, ids),
          ),
        )
        .orderBy(asc(teamRating.teamId))
        .for('update');
      const next = update(new Map(rows.map((r) => [r.teamId, toRating(r)])));
      for (const r of next)
        await tx
          .update(teamRating)
          .set({
            rating: r.rating,
            rd: r.rd,
            volatility: r.volatility,
            games: r.games,
            wins: r.wins,
            losses: r.losses,
            draws: r.draws,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(teamRating.teamId, r.teamId),
              eq(teamRating.seasonId, seasonId),
              eq(teamRating.size, size),
            ),
          );
      return next;
    });
  }

  async setJoined(seasonId: string, size: TeamSize, teamId: string, joined: boolean) {
    const [row] = await this.db
      .insert(teamRating)
      .values({ ...fresh(seasonId, size, teamId), leagueJoined: joined })
      .onConflictDoUpdate({
        target: [teamRating.teamId, teamRating.seasonId, teamRating.size],
        set: { leagueJoined: joined },
      })
      .returning();
    return toRating(row!);
  }

  async entrants(seasonId: string, size: TeamSize, minGames: number) {
    const rows = await this.db
      .select()
      .from(teamRating)
      .where(
        and(
          eq(teamRating.seasonId, seasonId),
          eq(teamRating.size, size),
          eq(teamRating.leagueJoined, true),
          gte(teamRating.games, minGames),
        ),
      )
      .orderBy(desc(teamRating.rating), asc(teamRating.teamId));
    return rows.map(toRating);
  }

  async leaderboard(
    seasonId: string,
    size: TeamSize,
    options: { minGames: number; limit: number },
  ): Promise<TeamLeaderboardRow[]> {
    const rows = await this.db
      .select({
        r: teamRating,
        name: team.name,
        tag: team.tag,
        logo: team.logo,
        community: community.name,
      })
      .from(teamRating)
      .innerJoin(team, eq(team.id, teamRating.teamId))
      .innerJoin(community, eq(community.id, team.communityId))
      .where(
        and(
          eq(teamRating.seasonId, seasonId),
          eq(teamRating.size, size),
          gte(teamRating.games, options.minGames),
        ),
      )
      .orderBy(desc(teamRating.rating), asc(team.name))
      .limit(options.limit);
    return rows.map((x) => ({
      ...toRating(x.r),
      name: x.name,
      tag: x.tag,
      logo: x.logo,
      community: x.community,
    }));
  }

  async activeCycle(seasonId: string, size: TeamSize) {
    const [row] = await this.db
      .select()
      .from(teamLeagueCycle)
      .where(
        and(
          eq(teamLeagueCycle.seasonId, seasonId),
          eq(teamLeagueCycle.size, size),
          eq(teamLeagueCycle.status, 'active'),
        ),
      )
      .orderBy(desc(teamLeagueCycle.number))
      .limit(1);
    return row ? toCycle(row) : null;
  }

  async lastCycle(seasonId: string, size: TeamSize) {
    const [row] = await this.db
      .select()
      .from(teamLeagueCycle)
      .where(and(eq(teamLeagueCycle.seasonId, seasonId), eq(teamLeagueCycle.size, size)))
      .orderBy(desc(teamLeagueCycle.number))
      .limit(1);
    return row ? toCycle(row) : null;
  }

  createCycle(input: Parameters<TeamLeagueRepository['createCycle']>[0]) {
    return this.db.transaction(async (tx) => {
      const [cycle] = await tx
        .insert(teamLeagueCycle)
        .values({
          seasonId: input.seasonId,
          size: input.size,
          number: input.number,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        })
        .returning();
      if (input.members.length)
        await tx
          .insert(teamLeagueMember)
          .values(input.members.map((m) => ({ ...m, cycleId: cycle!.id })));
      if (input.matches.length)
        await tx
          .insert(teamLeagueMatch)
          .values(input.matches.map((m) => ({ ...m, cycleId: cycle!.id })));
      return toCycle(cycle!);
    });
  }

  async members(cycleId: string): Promise<TeamMemberRecord[]> {
    return this.db
      .select()
      .from(teamLeagueMember)
      .where(eq(teamLeagueMember.cycleId, cycleId))
      .orderBy(asc(teamLeagueMember.division), asc(teamLeagueMember.place));
  }

  async matches(cycleId: string): Promise<TeamMatchRecord[]> {
    return this.db
      .select()
      .from(teamLeagueMatch)
      .where(eq(teamLeagueMatch.cycleId, cycleId))
      .orderBy(
        asc(teamLeagueMatch.matchday),
        asc(teamLeagueMatch.division),
        asc(teamLeagueMatch.id),
      );
  }

  async nextEvent(cycleId: string): Promise<{ kind: 'lock' | 'play'; at: Date } | null> {
    const first = async (status: 'scheduled' | 'locked') => {
      const column = status === 'scheduled' ? teamLeagueMatch.lockAt : teamLeagueMatch.playAt;
      const [row] = await this.db
        .select({ at: column })
        .from(teamLeagueMatch)
        .where(and(eq(teamLeagueMatch.cycleId, cycleId), eq(teamLeagueMatch.status, status)))
        .orderBy(asc(column))
        .limit(1);
      return row?.at ?? null;
    };
    const lock = await first('scheduled');
    const play = await first('locked');
    if (lock && (!play || lock.getTime() <= play.getTime())) return { kind: 'lock', at: lock };
    return play ? { kind: 'play', at: play } : null;
  }

  async lockMatches(updates: { id: string; snapshots: CombatantSnapshot[][] }[]) {
    await this.db.transaction(async (tx) => {
      for (const u of updates)
        await tx
          .update(teamLeagueMatch)
          .set({ status: 'locked', snapshots: u.snapshots })
          .where(and(eq(teamLeagueMatch.id, u.id), eq(teamLeagueMatch.status, 'scheduled')));
    });
  }

  async finishMatch(
    id: string,
    result: { fightId: string | null; winnerTeamId: string | null; draw: boolean },
  ) {
    await this.db
      .update(teamLeagueMatch)
      .set({ status: 'played', ...result })
      .where(and(eq(teamLeagueMatch.id, id), eq(teamLeagueMatch.status, 'locked')));
  }

  async finishCycle(
    cycleId: string,
    at: Date,
    rows: { teamId: string; place: number; movement: 'up' | 'down' | 'stay' }[],
  ) {
    await this.db.transaction(async (tx) => {
      for (const r of rows)
        await tx
          .update(teamLeagueMember)
          .set({ place: r.place, movement: r.movement })
          .where(and(eq(teamLeagueMember.cycleId, cycleId), eq(teamLeagueMember.teamId, r.teamId)));
      await tx
        .update(teamLeagueCycle)
        .set({ status: 'finished', finishedAt: at })
        .where(and(eq(teamLeagueCycle.id, cycleId), eq(teamLeagueCycle.status, 'active')));
    });
  }
}
