import type { Attributes, CharacterBuild, ClassId } from '@tbca/game-core';

/** Gespeicherter Charakter einer Season mit seinen Loadouts je Klasse. */
export interface CharacterRecord {
  id: string;
  accountId: string;
  seasonId: string;
  name: string;
  classId: ClassId;
  level: number;
  xp: number;
  allocated: Attributes;
  loadouts: Partial<Record<ClassId, CharacterBuild['loadout']>>;
}

export class NameTakenError extends Error {
  override readonly name = 'NameTakenError';
}

export class CharacterExistsError extends Error {
  override readonly name = 'CharacterExistsError';
}

export interface CharacterRepository {
  findForAccount(accountId: string, seasonId: string): Promise<CharacterRecord | null>;
  /** Legt Charakter und Loadout an; wirft NameTakenError oder CharacterExistsError. */
  create(record: Omit<CharacterRecord, 'id'>): Promise<CharacterRecord>;
  /** Speichert Klasse, Punkte und das Loadout der aktuellen Klasse. */
  save(record: CharacterRecord): Promise<void>;
  isNameTaken(seasonId: string, name: string): Promise<boolean>;
  findById(id: string): Promise<CharacterRecord | null>;
  /** Charaktere der Season, nach Name gefiltert, ohne den eigenen Account, nahe `nearLevel` zuerst. */
  search(
    seasonId: string,
    query: string,
    excludeAccountId: string,
    nearLevel: number,
    limit: number,
  ): Promise<Pick<CharacterRecord, 'id' | 'name' | 'level' | 'classId'>[]>;
}
