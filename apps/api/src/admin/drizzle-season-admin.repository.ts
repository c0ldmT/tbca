import {
  account,
  character,
  creditTransaction,
  dailyReset,
  dungeonRun,
  fight,
  fightParticipant,
  itemInstance,
  leagueCycle,
  materialStack,
  rating,
  season,
  shopPurchase,
  wallet,
  xpLedgerDaily,
  type Database,
} from '@tbca/db';
import { and, count, desc, eq, inArray, sql, sum } from 'drizzle-orm';

import type {
  DailyResetEntry,
  SeasonAdminRepository,
  SeasonResetCounts,
  SeasonStats,
} from './types.js';

export class DrizzleSeasonAdminRepository implements SeasonAdminRepository {
  constructor(private readonly db: Database) {}

  async info(seasonId: string) {
    const [row] = await this.db
      .select({ slug: season.slug, startsAt: season.startsAt, endsAt: season.endsAt })
      .from(season)
      .where(eq(season.id, seasonId));
    return row ?? null;
  }

  async stats(seasonId: string, day: string): Promise<SeasonStats> {
    const [chars, played, runs, active, rewarded, passive] = await Promise.all([
      this.db
        .select({ isBot: account.isBot, n: count() })
        .from(character)
        .innerJoin(account, eq(account.id, character.accountId))
        .where(eq(character.seasonId, seasonId))
        .groupBy(account.isBot),
      this.db.execute<{ n: number }>(sql`
        select count(*)::int as n from (
          select ${fightParticipant.characterId} as id from ${fightParticipant}
            inner join ${fight} on ${fight.id} = ${fightParticipant.fightId}
            where ${fight.seasonId} = ${seasonId} and ${fight.rewardDay} = ${day}
              and ${fightParticipant.characterId} is not null
          union
          select ${dungeonRun.characterId} from ${dungeonRun}
            where ${dungeonRun.seasonId} = ${seasonId} and ${dungeonRun.rewardDay} = ${day}
        ) as played`),
      this.db
        .select({ n: count() })
        .from(dungeonRun)
        .where(and(eq(dungeonRun.seasonId, seasonId), eq(dungeonRun.rewardDay, day))),
      this.db
        .select({ n: count() })
        .from(dungeonRun)
        .where(and(eq(dungeonRun.seasonId, seasonId), eq(dungeonRun.status, 'active'))),
      this.db
        .select({ n: count() })
        .from(fightParticipant)
        .innerJoin(fight, eq(fight.id, fightParticipant.fightId))
        .where(
          and(
            eq(fight.seasonId, seasonId),
            eq(fight.rewardDay, day),
            eq(fightParticipant.rewarded, true),
          ),
        ),
      this.db
        .select({ n: sum(xpLedgerDaily.passiveAwarded).mapWith(Number) })
        .from(xpLedgerDaily)
        .where(and(eq(xpLedgerDaily.seasonId, seasonId), eq(xpLedgerDaily.day, day))),
    ]);
    return {
      characters: chars.find((c) => !c.isBot)?.n ?? 0,
      bots: chars.find((c) => c.isBot)?.n ?? 0,
      playedToday: Number(played.rows[0]?.n ?? 0),
      dungeonRunsToday: runs[0]?.n ?? 0,
      activeRuns: active[0]?.n ?? 0,
      rewardedFightsToday: rewarded[0]?.n ?? 0,
      passiveXpToday: passive[0]?.n ?? 0,
    };
  }

  async resetsOn(seasonId: string, day: string): Promise<DailyResetEntry[]> {
    return this.db
      .select({
        kind: dailyReset.kind,
        characterName: character.name,
        createdAt: dailyReset.createdAt,
      })
      .from(dailyReset)
      .leftJoin(character, eq(character.id, dailyReset.characterId))
      .where(and(eq(dailyReset.seasonId, seasonId), eq(dailyReset.day, day)))
      .orderBy(desc(dailyReset.createdAt))
      .limit(50);
  }

  async resetDaily(input: Parameters<SeasonAdminRepository['resetDaily']>[0]): Promise<void> {
    await this.db.transaction(async (tx) => {
      const marks = input.kinds.filter((k): k is 'dungeon' | 'fights' => k !== 'passive');
      if (marks.length > 0) {
        await tx.insert(dailyReset).values(
          marks.map((kind) => ({
            seasonId: input.seasonId,
            characterId: input.account?.characterId ?? null,
            kind,
            day: input.day,
          })),
        );
      }
      if (input.kinds.includes('passive')) {
        // Nur der Zähler für die Deckelung; bereits vergebene XP bleiben.
        await tx
          .update(xpLedgerDaily)
          .set({ passiveRaw: 0 })
          .where(
            and(
              eq(xpLedgerDaily.seasonId, input.seasonId),
              eq(xpLedgerDaily.day, input.day),
              input.account ? eq(xpLedgerDaily.accountId, input.account.accountId) : undefined,
            ),
          );
      }
    });
  }

  async resetSeason(seasonId: string, mode: 'progress' | 'wipe'): Promise<SeasonResetCounts> {
    return this.db.transaction(async (tx) => {
      const fights = await tx.delete(fight).where(eq(fight.seasonId, seasonId));
      const runs = await tx.delete(dungeonRun).where(eq(dungeonRun.seasonId, seasonId));
      const items = await tx.delete(itemInstance).where(eq(itemInstance.seasonId, seasonId));
      await tx.delete(materialStack).where(eq(materialStack.seasonId, seasonId));
      await tx.delete(shopPurchase).where(eq(shopPurchase.seasonId, seasonId));
      await tx.delete(creditTransaction).where(eq(creditTransaction.seasonId, seasonId));
      await tx.delete(wallet).where(eq(wallet.seasonId, seasonId));
      await tx.delete(xpLedgerDaily).where(eq(xpLedgerDaily.seasonId, seasonId));
      await tx.delete(dailyReset).where(eq(dailyReset.seasonId, seasonId));
      // Liga und Rating beginnen von vorn
      await tx.delete(leagueCycle).where(eq(leagueCycle.seasonId, seasonId));
      await tx.delete(rating).where(eq(rating.seasonId, seasonId));
      let removed = 0;
      if (mode === 'wipe') {
        const humans = tx.select({ id: account.id }).from(account).where(eq(account.isBot, false));
        const result = await tx
          .delete(character)
          .where(and(eq(character.seasonId, seasonId), inArray(character.accountId, humans)));
        removed = result.rowCount ?? 0;
      }
      // Gespeicherte Loadouts bleiben; gesperrte Fähigkeiten fallen beim Kampf auf das
      // Standard-Loadout zurück. Die Startausrüstung entsteht beim nächsten Aufruf neu.
      const reset = await tx
        .update(character)
        .set({ level: 1, xp: 0, attrStr: 0, attrDex: 0, attrInt: 0, attrCon: 0 })
        .where(eq(character.seasonId, seasonId));
      return {
        characters: removed + (reset.rowCount ?? 0),
        fights: fights.rowCount ?? 0,
        runs: runs.rowCount ?? 0,
        items: items.rowCount ?? 0,
      };
    });
  }

  async setEnd(seasonId: string, endsAt: Date): Promise<void> {
    await this.db.update(season).set({ endsAt }).where(eq(season.id, seasonId));
  }
}
