import {
  account,
  character,
  creditEntry,
  creditTransaction,
  dungeonRun,
  equipment,
  fight,
  fightParticipant,
  itemInstance,
  loadout,
  shopPurchase,
  xpLedgerDaily,
  type Database,
} from '@tbca/db';
import type { CombatantSnapshot } from '@tbca/game-core';
import { and, count, desc, eq, gte, inArray, sql, sum } from 'drizzle-orm';

import type { AdminExportRepository, ExportRows } from './types.js';

export class DrizzleExportRepository implements AdminExportRepository {
  constructor(private readonly db: Database) {}

  async rows(seasonId: string, since: Date, limit: number): Promise<ExportRows> {
    const [chars, gear, loadouts, fights, runs, credits, items, purchases, passive] =
      await Promise.all([
        this.db
          .select({
            id: character.id,
            isBot: account.isBot,
            classId: character.class,
            level: character.level,
            xp: character.xp,
            str: character.attrStr,
            dex: character.attrDex,
            int: character.attrInt,
            con: character.attrCon,
            createdAt: character.createdAt,
          })
          .from(character)
          .innerJoin(account, eq(account.id, character.accountId))
          .where(eq(character.seasonId, seasonId)),
        this.db
          .select({
            characterId: equipment.characterId,
            slot: equipment.slot,
            item: itemInstance.data,
          })
          .from(equipment)
          .innerJoin(itemInstance, eq(itemInstance.id, equipment.itemId))
          .where(eq(itemInstance.seasonId, seasonId)),
        this.db
          .select({
            characterId: loadout.characterId,
            classId: loadout.classId,
            abilities: loadout.abilities,
            tactics: loadout.tactics,
          })
          .from(loadout)
          .innerJoin(character, eq(character.id, loadout.characterId))
          .where(eq(character.seasonId, seasonId)),
        this.db
          .select({
            id: fight.id,
            kind: fight.kind,
            createdAt: fight.createdAt,
            rewardDay: fight.rewardDay,
            configVersion: fight.configVersion,
            engineVersion: fight.engineVersion,
            rounds: fight.rounds,
            winnerTeam: fight.winnerTeam,
            reason: fight.reason,
            input: fight.input,
          })
          .from(fight)
          .where(and(eq(fight.seasonId, seasonId), gte(fight.createdAt, since)))
          .orderBy(desc(fight.createdAt))
          .limit(limit),
        this.db
          .select()
          .from(dungeonRun)
          .where(and(eq(dungeonRun.seasonId, seasonId), gte(dungeonRun.createdAt, since))),
        this.db
          .select({
            kind: creditTransaction.kind,
            transactions: sql<number>`count(distinct ${creditTransaction.id})::int`,
            toPlayers: sql<number>`coalesce(sum(${creditEntry.amount}) filter (where ${creditEntry.accountId} is not null and ${creditEntry.amount} > 0), 0)::bigint`,
            fromPlayers: sql<number>`coalesce(-sum(${creditEntry.amount}) filter (where ${creditEntry.accountId} is not null and ${creditEntry.amount} < 0), 0)::bigint`,
          })
          .from(creditTransaction)
          .innerJoin(creditEntry, eq(creditEntry.transactionId, creditTransaction.id))
          .where(eq(creditTransaction.seasonId, seasonId))
          .groupBy(creditTransaction.kind),
        this.db
          .select({
            templateId: sql<string>`${itemInstance.data}->>'templateId'`,
            rarity: sql<number>`(${itemInstance.data}->>'rarity')::int`,
            source: itemInstance.source,
            count: count(),
          })
          .from(itemInstance)
          .where(eq(itemInstance.seasonId, seasonId))
          .groupBy(sql`1`, sql`2`, itemInstance.source),
        this.db
          .select({ day: shopPurchase.day, offerId: shopPurchase.offerId, count: count() })
          .from(shopPurchase)
          .where(eq(shopPurchase.seasonId, seasonId))
          .groupBy(shopPurchase.day, shopPurchase.offerId),
        this.db
          .select({
            day: xpLedgerDaily.day,
            accounts: count(),
            raw: sum(xpLedgerDaily.passiveRaw).mapWith(Number),
            awarded: sum(xpLedgerDaily.passiveAwarded).mapWith(Number),
            messages: sum(xpLedgerDaily.messages).mapWith(Number),
          })
          .from(xpLedgerDaily)
          .where(eq(xpLedgerDaily.seasonId, seasonId))
          .groupBy(xpLedgerDaily.day),
      ]);

    const participants =
      fights.length === 0
        ? []
        : await this.db
            .select()
            .from(fightParticipant)
            .where(
              inArray(
                fightParticipant.fightId,
                fights.map((f) => f.id),
              ),
            );
    const byFight = groupBy(participants, (p) => p.fightId);
    const gearOf = groupBy(gear, (g) => g.characterId);

    return {
      characters: chars.map((c) => {
        const own = loadouts.find((l) => l.characterId === c.id && l.classId === c.classId);
        return {
          id: c.id,
          isBot: c.isBot,
          classId: c.classId,
          level: c.level,
          xp: c.xp,
          allocated: { str: c.str, dex: c.dex, int: c.int, con: c.con },
          createdAt: c.createdAt,
          loadout: own ? { abilities: own.abilities, tactics: own.tactics } : null,
          equipment: (gearOf.get(c.id) ?? []).map((g) => ({ slot: g.slot, item: g.item })),
        };
      }),
      fights: fights.map((f) => ({
        kind: f.kind,
        createdAt: f.createdAt,
        rewardDay: f.rewardDay,
        configVersion: f.configVersion,
        engineVersion: f.engineVersion,
        rounds: f.rounds,
        winnerTeam: f.winnerTeam,
        reason: f.reason,
        teams: (f.input.teams ?? []) as readonly (readonly CombatantSnapshot[])[],
        participants: (byFight.get(f.id) ?? []).map((p) => ({
          team: p.team,
          slot: p.slot,
          characterId: p.characterId,
          won: p.won,
          rewarded: p.rewarded,
          xpAwarded: p.xpAwarded,
          creditsAwarded: p.creditsAwarded,
        })),
      })),
      runs: runs.map((r) => ({
        characterId: r.characterId,
        classId: r.snapshot.classId,
        level: r.snapshot.level,
        floor: r.floor,
        status: r.status,
        xpGained: r.xpGained,
        lootCredits: r.loot.credits,
        lootItems: r.loot.items.length,
        injectors: r.injectors,
        backupChip: r.backupChip,
        rewardDay: r.rewardDay,
      })),
      credits: credits.map((c) => ({
        kind: c.kind,
        transactions: Number(c.transactions),
        toPlayers: Number(c.toPlayers),
        fromPlayers: Number(c.fromPlayers),
      })),
      items: items.map((i) => ({ ...i, rarity: Number(i.rarity) })),
      purchases,
      passive: passive.map((p) => ({
        day: p.day,
        accounts: p.accounts,
        raw: p.raw ?? 0,
        awarded: p.awarded ?? 0,
        messages: p.messages ?? 0,
      })),
    };
  }
}

function groupBy<T>(list: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    const bucket = map.get(k);
    if (bucket) bucket.push(x);
    else map.set(k, [x]);
  }
  return map;
}
