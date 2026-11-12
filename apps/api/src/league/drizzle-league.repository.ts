import {
  account,
  character,
  communityMember,
  leagueCycle,
  leagueMatch,
  leagueMember,
  rating,
  type Database,
} from '@tbca/db';
import type { CombatantSnapshot } from '@tbca/game-core';
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';

import { GLICKO_START } from './glicko2.js';
import type {
  CycleRecord,
  LeaderboardRow,
  LeagueRepository,
  MatchRecord,
  MemberRecord,
  RatingRecord,
} from './types.js';

type Row = typeof rating.$inferSelect;

const toRating = (r: Row): RatingRecord => ({
  characterId: r.characterId,
  seasonId: r.seasonId,
  rating: r.rating,
  rd: r.rd,
  volatility: r.volatility,
  games: r.games,
  wins: r.wins,
  losses: r.losses,
  draws: r.draws,
  leagueJoined: r.leagueJoined,
});

const fresh = (seasonId: string, characterId: string): RatingRecord => ({
  characterId,
  seasonId,
  ...GLICKO_START,
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  leagueJoined: false,
});

export class DrizzleLeagueRepository implements LeagueRepository {
  constructor(private readonly db: Database) {}

  async ratings(characterIds: readonly string[]): Promise<Map<string, RatingRecord>> {
    if (characterIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(rating)
      .where(inArray(rating.characterId, [...characterIds]));
    return new Map(rows.map((r) => [r.characterId, toRating(r)]));
  }

  updateRatings(
    seasonId: string,
    characterIds: readonly string[],
    update: (current: Map<string, RatingRecord>) => RatingRecord[],
  ): Promise<RatingRecord[]> {
    return this.db.transaction(async (tx) => {
      const ids = [...new Set(characterIds)].sort();
      await tx
        .insert(rating)
        .values(ids.map((id) => ({ ...fresh(seasonId, id) })))
        .onConflictDoNothing();
      const rows = await tx
        .select()
        .from(rating)
        .where(inArray(rating.characterId, ids))
        .orderBy(asc(rating.characterId))
        .for('update');
      const next = update(new Map(rows.map((r) => [r.characterId, toRating(r)])));
      for (const r of next) {
        await tx
          .update(rating)
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
          .where(eq(rating.characterId, r.characterId));
      }
      return next;
    });
  }

  async setJoined(seasonId: string, characterId: string, joined: boolean): Promise<RatingRecord> {
    const [row] = await this.db
      .insert(rating)
      .values({ ...fresh(seasonId, characterId), leagueJoined: joined })
      .onConflictDoUpdate({ target: rating.characterId, set: { leagueJoined: joined } })
      .returning();
    return toRating(row!);
  }

  async entrants(seasonId: string, minGames: number): Promise<RatingRecord[]> {
    const rows = await this.db
      .select()
      .from(rating)
      .where(
        and(
          eq(rating.seasonId, seasonId),
          eq(rating.leagueJoined, true),
          gte(rating.games, minGames),
        ),
      )
      .orderBy(desc(rating.rating), asc(rating.characterId));
    return rows.map(toRating);
  }

  async leaderboard(
    seasonId: string,
    options: { minGames: number; limit: number; homeOfAccount: string | null },
  ): Promise<LeaderboardRow[]> {
    const conditions = [eq(rating.seasonId, seasonId), gte(rating.games, options.minGames)];
    if (options.homeOfAccount) {
      // Nur Accounts mit derselben Heimat-Community wie der fragende Account
      const home = this.db
        .select({ id: communityMember.communityId })
        .from(communityMember)
        .where(
          and(
            eq(communityMember.accountId, options.homeOfAccount),
            eq(communityMember.isHome, true),
          ),
        );
      conditions.push(
        inArray(
          character.accountId,
          this.db
            .select({ id: communityMember.accountId })
            .from(communityMember)
            .where(
              and(eq(communityMember.isHome, true), inArray(communityMember.communityId, home)),
            ),
        ),
      );
    }
    const rows = await this.db
      .select({
        r: rating,
        name: character.name,
        level: character.level,
        classId: character.class,
        isBot: account.isBot,
      })
      .from(rating)
      .innerJoin(character, eq(character.id, rating.characterId))
      .innerJoin(account, eq(account.id, character.accountId))
      .where(and(...conditions))
      .orderBy(desc(rating.rating), asc(character.name))
      .limit(options.limit);
    return rows.map((x) => ({
      ...toRating(x.r),
      name: x.name,
      level: x.level,
      classId: x.classId,
      isBot: x.isBot,
    }));
  }

  async activeCycle(seasonId: string): Promise<CycleRecord | null> {
    const [row] = await this.db
      .select()
      .from(leagueCycle)
      .where(and(eq(leagueCycle.seasonId, seasonId), eq(leagueCycle.status, 'active')))
      .orderBy(desc(leagueCycle.number))
      .limit(1);
    return row ?? null;
  }

  async lastCycle(seasonId: string): Promise<CycleRecord | null> {
    const [row] = await this.db
      .select()
      .from(leagueCycle)
      .where(eq(leagueCycle.seasonId, seasonId))
      .orderBy(desc(leagueCycle.number))
      .limit(1);
    return row ?? null;
  }

  async findCycle(id: string): Promise<CycleRecord | null> {
    const [row] = await this.db.select().from(leagueCycle).where(eq(leagueCycle.id, id));
    return row ?? null;
  }

  createCycle(input: Parameters<LeagueRepository['createCycle']>[0]): Promise<CycleRecord> {
    return this.db.transaction(async (tx) => {
      const [cycle] = await tx
        .insert(leagueCycle)
        .values({
          seasonId: input.seasonId,
          number: input.number,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        })
        .returning();
      if (input.members.length)
        await tx
          .insert(leagueMember)
          .values(input.members.map((m) => ({ ...m, cycleId: cycle!.id })));
      if (input.matches.length)
        await tx
          .insert(leagueMatch)
          .values(input.matches.map((m) => ({ ...m, cycleId: cycle!.id })));
      return cycle!;
    });
  }

  async members(cycleId: string): Promise<MemberRecord[]> {
    return this.db
      .select()
      .from(leagueMember)
      .where(eq(leagueMember.cycleId, cycleId))
      .orderBy(asc(leagueMember.division), asc(leagueMember.place));
  }

  async matches(cycleId: string): Promise<MatchRecord[]> {
    return this.db
      .select()
      .from(leagueMatch)
      .where(eq(leagueMatch.cycleId, cycleId))
      .orderBy(asc(leagueMatch.matchday), asc(leagueMatch.division), asc(leagueMatch.id));
  }

  async nextEvent(cycleId: string): Promise<{ kind: 'lock' | 'play'; at: Date } | null> {
    const first = async (status: 'scheduled' | 'locked') => {
      const column = status === 'scheduled' ? leagueMatch.lockAt : leagueMatch.playAt;
      const [row] = await this.db
        .select({ at: column })
        .from(leagueMatch)
        .where(and(eq(leagueMatch.cycleId, cycleId), eq(leagueMatch.status, status)))
        .orderBy(asc(column))
        .limit(1);
      return row?.at ?? null;
    };
    const lock = await first('scheduled');
    const play = await first('locked');
    // Bei Gleichstand zuerst sperren, dann spielen
    if (lock && (!play || lock.getTime() <= play.getTime())) return { kind: 'lock', at: lock };
    return play ? { kind: 'play', at: play } : null;
  }

  async lockMatches(updates: { id: string; snapshots: CombatantSnapshot[] }[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const u of updates)
        await tx
          .update(leagueMatch)
          .set({ status: 'locked', snapshots: u.snapshots })
          .where(and(eq(leagueMatch.id, u.id), eq(leagueMatch.status, 'scheduled')));
    });
  }

  async finishMatch(
    id: string,
    result: { fightId: string | null; winnerCharacterId: string | null; draw: boolean },
  ): Promise<void> {
    await this.db
      .update(leagueMatch)
      .set({ status: 'played', ...result })
      .where(and(eq(leagueMatch.id, id), eq(leagueMatch.status, 'locked')));
  }

  async finishCycle(
    cycleId: string,
    at: Date,
    rows: { characterId: string; place: number; movement: 'up' | 'down' | 'stay' }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const r of rows)
        await tx
          .update(leagueMember)
          .set({ place: r.place, movement: r.movement })
          .where(
            and(eq(leagueMember.cycleId, cycleId), eq(leagueMember.characterId, r.characterId)),
          );
      await tx
        .update(leagueCycle)
        .set({ status: 'finished', finishedAt: at })
        .where(and(eq(leagueCycle.id, cycleId), eq(leagueCycle.status, 'active')));
    });
  }

  async memberships(characterId: string, limit: number): Promise<MemberRecord[]> {
    const rows = await this.db
      .select({ m: leagueMember })
      .from(leagueMember)
      .innerJoin(leagueCycle, eq(leagueCycle.id, leagueMember.cycleId))
      .where(eq(leagueMember.characterId, characterId))
      .orderBy(desc(leagueCycle.number))
      .limit(limit);
    return rows.map((r) => r.m);
  }
}
