import { gunzipSync, gzipSync } from 'node:zlib';

import { character, fight, fightParticipant, transferCredits, type Database } from '@tbca/db';
import type { BattleEvent } from '@tbca/game-core';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { FightRepository, FightTx, NewFight, RewardCounts, StoredFight } from './types.js';

type Executor = Pick<Database, 'select' | 'insert' | 'update'>;

async function countRewards(db: Executor, characterId: string, day: string): Promise<RewardCounts> {
  const rows = await db
    .select({ opponent: fightParticipant.opponentCharacterId, count: sql<number>`count(*)::int` })
    .from(fightParticipant)
    .innerJoin(fight, eq(fight.id, fightParticipant.fightId))
    .where(
      and(
        eq(fightParticipant.characterId, characterId),
        eq(fightParticipant.rewarded, true),
        eq(fight.rewardDay, day),
      ),
    )
    .groupBy(fightParticipant.opponentCharacterId);
  const byOpponent = new Map<string, number>();
  let today = 0;
  for (const row of rows) {
    today += row.count;
    if (row.opponent) byOpponent.set(row.opponent, row.count);
  }
  return { today, byOpponent };
}

export class DrizzleFightRepository implements FightRepository {
  constructor(private readonly db: Database) {}

  locked<T>(characterId: string, fn: (tx: FightTx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      // Sperre gilt bis zum Ende der Transaktion: parallele Herausforderungen zählen korrekt.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${characterId}, 0))`);
      return fn({
        rewardCounts: (id, day) => countRewards(tx, id, day),
        insert: async (f: NewFight) => {
          const [row] = await tx
            .insert(fight)
            .values({
              seasonId: f.seasonId,
              kind: f.kind,
              engineVersion: f.result.engineVersion,
              configVersion: f.configVersion,
              seed: f.seed,
              input: f.input,
              events: gzipSync(JSON.stringify(f.result.events)),
              logHash: f.result.logHash,
              winnerTeam: f.result.winner,
              reason: f.result.reason,
              rounds: f.result.rounds,
              rewardDay: f.rewardDay,
            })
            .returning({ id: fight.id });
          await tx
            .insert(fightParticipant)
            .values(f.participants.map((p) => ({ ...p, fightId: row!.id })));
          return row!.id;
        },
        setProgress: async (id, xp, level) => {
          await tx.update(character).set({ xp, level }).where(eq(character.id, id));
        },
        rewardCredits: async (seasonId, accountId, amount, fightId) => {
          await transferCredits(tx, {
            seasonId,
            kind: 'pvp_reward',
            refId: fightId,
            lines: [
              { accountId, amount },
              { system: 'source:pvp', amount: -amount },
            ],
          });
        },
      });
    });
  }

  rewardCounts(characterId: string, day: string): Promise<RewardCounts> {
    return countRewards(this.db, characterId, day);
  }

  async findById(id: string): Promise<StoredFight | null> {
    const [row] = await this.db.select().from(fight).where(eq(fight.id, id));
    return row ? (await this.hydrate([row]))[0]! : null;
  }

  async listForCharacter(characterId: string, limit: number): Promise<StoredFight[]> {
    const ids = this.db
      .select({ id: fightParticipant.fightId })
      .from(fightParticipant)
      .where(eq(fightParticipant.characterId, characterId));
    const rows = await this.db
      .select()
      .from(fight)
      .where(inArray(fight.id, ids))
      .orderBy(desc(fight.createdAt))
      .limit(limit);
    return this.hydrate(rows);
  }

  private async hydrate(rows: (typeof fight.$inferSelect)[]): Promise<StoredFight[]> {
    if (rows.length === 0) return [];
    const participants = await this.db
      .select()
      .from(fightParticipant)
      .where(
        inArray(
          fightParticipant.fightId,
          rows.map((r) => r.id),
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      seasonId: r.seasonId,
      kind: r.kind,
      seed: r.seed,
      engineVersion: r.engineVersion,
      configVersion: r.configVersion,
      input: r.input,
      rewardDay: r.rewardDay,
      result: {
        winner: r.winnerTeam,
        reason: r.reason,
        rounds: r.rounds,
        logHash: r.logHash,
        events: JSON.parse(gunzipSync(r.events).toString('utf8')) as BattleEvent[],
      },
      participants: participants
        .filter((p) => p.fightId === r.id)
        .map(({ fightId: _fightId, ...p }) => p),
    }));
  }
}
