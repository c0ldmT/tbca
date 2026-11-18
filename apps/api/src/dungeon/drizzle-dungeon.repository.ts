import { character, dungeonRun, type Database } from '@tbca/db';
import { and, count, desc, eq, sql } from 'drizzle-orm';

import { commitEconomy } from '../economy/drizzle-economy.repository.js';
import { insertFight } from '../fight/drizzle-fight.repository.js';
import type { DungeonRepository, DungeonRun, DungeonTx } from './types.js';

type Row = typeof dungeonRun.$inferSelect;

const toRun = (r: Row): DungeonRun => ({
  id: r.id,
  seasonId: r.seasonId,
  accountId: r.accountId,
  characterId: r.characterId,
  status: r.status,
  floor: r.floor,
  seed: r.seed,
  snapshot: r.snapshot,
  hp: r.hp,
  energy: r.energy,
  injectors: r.injectors,
  backupChip: r.backupChip,
  loot: r.loot,
  xpGained: r.xpGained,
  lastFightId: r.lastFightId,
  rewardDay: r.rewardDay,
  lastActionAt: r.lastActionAt,
  endedAt: r.endedAt,
});

export class DrizzleDungeonRepository implements DungeonRepository {
  constructor(private readonly db: Database) {}

  locked<T>(characterId: string, fn: (tx: DungeonTx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${'dungeon:' + characterId}, 0))`,
      );
      return fn({
        activeRun: async (id) => {
          const [row] = await tx
            .select()
            .from(dungeonRun)
            .where(and(eq(dungeonRun.characterId, id), eq(dungeonRun.status, 'active')));
          return row ? toRun(row) : null;
        },
        runsOnDay: async (id, day) => {
          const [row] = await tx
            .select({ n: count() })
            .from(dungeonRun)
            .where(and(eq(dungeonRun.characterId, id), eq(dungeonRun.rewardDay, day)));
          return row?.n ?? 0;
        },
        saveRun: async (run) => {
          const { id, ...values } = run;
          if (id) {
            const [row] = await tx
              .update(dungeonRun)
              .set(values)
              .where(eq(dungeonRun.id, id))
              .returning();
            return toRun(row!);
          }
          const [row] = await tx.insert(dungeonRun).values(values).returning();
          return toRun(row!);
        },
        insertFight: (f) => insertFight(tx, f),
        economy: async (change) => {
          await commitEconomy(tx, change);
        },
        setProgress: async (id, xp, level) => {
          await tx.update(character).set({ xp, level }).where(eq(character.id, id));
        },
      });
    });
  }

  async latestRun(characterId: string): Promise<DungeonRun | null> {
    const [row] = await this.db
      .select()
      .from(dungeonRun)
      .where(eq(dungeonRun.characterId, characterId))
      .orderBy(desc(dungeonRun.createdAt))
      .limit(1);
    return row ? toRun(row) : null;
  }
}
