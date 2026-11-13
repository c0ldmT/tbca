import { character, loadout, type Database } from '@tbca/db';
import { and, eq, sql } from 'drizzle-orm';

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
    if (!row) return null;
    const loadouts = await this.db.select().from(loadout).where(eq(loadout.characterId, row.id));
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

  async save(record: CharacterRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
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
