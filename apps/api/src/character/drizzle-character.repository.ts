import {
  account,
  character,
  creditBalance,
  equipment,
  itemInstance,
  loadout,
  transferCredits,
  type Database,
} from '@tbca/db';
import { and, asc, eq, ilike, ne, sql } from 'drizzle-orm';

import {
  CharacterExistsError,
  NameTakenError,
  type CharacterRecord,
  type CharacterRepository,
} from './types.js';

/** Postgres meldet Verletzungen eindeutiger Indizes mit Code 23505 und dem Index-Namen. */
function uniqueViolation(error: unknown): string | null {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const pg = e as { code?: string; constraint?: string };
    if (pg.code === '23505') return pg.constraint ?? '';
  }
  return null;
}

export class DrizzleCharacterRepository implements CharacterRepository {
  constructor(private readonly db: Database) {}

  async findForAccount(accountId: string, seasonId: string): Promise<CharacterRecord | null> {
    const [row] = await this.db
      .select()
      .from(character)
      .where(and(eq(character.accountId, accountId), eq(character.seasonId, seasonId)));
    return row ? this.withLoadouts(row) : null;
  }

  async findById(id: string): Promise<CharacterRecord | null> {
    const [row] = await this.db.select().from(character).where(eq(character.id, id));
    return row ? this.withLoadouts(row) : null;
  }

  async search(
    seasonId: string,
    query: string,
    excludeAccountId: string,
    nearLevel: number,
    limit: number,
  ) {
    const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await this.db
      .select({
        id: character.id,
        name: character.name,
        level: character.level,
        classId: character.class,
        isBot: account.isBot,
      })
      .from(character)
      .innerJoin(account, eq(account.id, character.accountId))
      .where(
        and(
          eq(character.seasonId, seasonId),
          ne(character.accountId, excludeAccountId),
          query ? ilike(character.name, pattern) : undefined,
        ),
      )
      .orderBy(asc(sql`abs(${character.level} - ${nearLevel})`), asc(character.name))
      .limit(limit);
    return rows;
  }

  private async withLoadouts(row: typeof character.$inferSelect): Promise<CharacterRecord> {
    const loadouts = await this.db.select().from(loadout).where(eq(loadout.characterId, row.id));
    const [owner] = await this.db
      .select({ isBot: account.isBot })
      .from(account)
      .where(eq(account.id, row.accountId));
    const gear = await this.db
      .select({ slot: equipment.slot, data: itemInstance.data })
      .from(equipment)
      .innerJoin(itemInstance, eq(itemInstance.id, equipment.itemId))
      .where(eq(equipment.characterId, row.id));
    return {
      id: row.id,
      accountId: row.accountId,
      seasonId: row.seasonId,
      name: row.name,
      classId: row.class,
      level: row.level,
      xp: row.xp,
      allocated: { str: row.attrStr, dex: row.attrDex, int: row.attrInt, con: row.attrCon },
      loadouts: Object.fromEntries(
        loadouts.map((l) => [l.classId, { abilities: l.abilities, tactics: l.tactics }]),
      ),
      isBot: owner?.isBot ?? false,
      renamedAt: row.renamedAt,
      equipment: Object.fromEntries(gear.map((g) => [g.slot, g.data])),
    };
  }

  async create(record: Omit<CharacterRecord, 'id'>): Promise<CharacterRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(character)
          .values({
            accountId: record.accountId,
            seasonId: record.seasonId,
            name: record.name,
            class: record.classId,
            level: record.level,
            xp: record.xp,
            attrStr: record.allocated.str,
            attrDex: record.allocated.dex,
            attrInt: record.allocated.int,
            attrCon: record.allocated.con,
          })
          .returning({ id: character.id });
        const current = record.loadouts[record.classId];
        if (current) {
          await tx.insert(loadout).values({
            characterId: row!.id,
            classId: record.classId,
            abilities: [...current.abilities],
            tactics: [...current.tactics],
          });
        }
        return { ...record, id: row!.id };
      });
    } catch (error) {
      const constraint = uniqueViolation(error);
      if (constraint === 'character_season_name_idx') throw new NameTakenError(record.name);
      if (constraint === 'character_account_season_idx') throw new CharacterExistsError();
      throw error;
    }
  }

  async rename(record: CharacterRecord, name: string, cost: number, at: Date): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        if (cost > 0) {
          await transferCredits(tx, {
            seasonId: record.seasonId,
            kind: 'rename',
            refId: record.id,
            lines: [
              { accountId: record.accountId, amount: -cost },
              { system: 'sink:rename', amount: cost },
            ],
          });
        }
        await tx.update(character).set({ name, renamedAt: at }).where(eq(character.id, record.id));
      });
    } catch (error) {
      if (uniqueViolation(error) === 'character_season_name_idx') throw new NameTakenError(name);
      throw error;
    }
  }

  balance(accountId: string, seasonId: string): Promise<number> {
    return creditBalance(this.db, seasonId, accountId);
  }

  async save(record: CharacterRecord, charge?: { amount: number; kind: 'respec' }): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (charge && charge.amount > 0) {
        await transferCredits(tx, {
          seasonId: record.seasonId,
          kind: charge.kind,
          refId: record.id,
          lines: [
            { accountId: record.accountId, amount: -charge.amount },
            { system: 'sink:respec', amount: charge.amount },
          ],
        });
      }
      await tx
        .update(character)
        .set({
          class: record.classId,
          attrStr: record.allocated.str,
          attrDex: record.allocated.dex,
          attrInt: record.allocated.int,
          attrCon: record.allocated.con,
        })
        .where(eq(character.id, record.id));
      const current = record.loadouts[record.classId];
      if (!current) return;
      const values = { abilities: [...current.abilities], tactics: [...current.tactics] };
      await tx
        .insert(loadout)
        .values({ characterId: record.id, classId: record.classId, ...values })
        .onConflictDoUpdate({ target: [loadout.characterId, loadout.classId], set: values });
    });
  }

  async isNameTaken(seasonId: string, name: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: character.id })
      .from(character)
      .where(and(eq(character.seasonId, seasonId), sql`lower(${character.name}) = lower(${name})`))
      .limit(1);
    return Boolean(row);
  }
}
