import type { Attributes, CharacterBuild, ClassId, Equipment } from '@tbca/game-core';

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
  /** Zeitpunkt der letzten Umbenennung. */
  renamedAt?: Date | null;
  /** Computergesteuerter Gegner (Bot-Account). */
  isBot?: boolean;
  /** Ausgerüstete Items (beim Laden gefüllt). */
  equipment?: Equipment;
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
  /**
   * Speichert Klasse, Punkte und das Loadout der aktuellen Klasse; mit `charge` wird in derselben
   * Transaktion abgebucht (wirft InsufficientCreditsError, wenn der Saldo nicht reicht).
   */
  save(record: CharacterRecord, charge?: { amount: number; kind: 'respec' }): Promise<void>;
  /**
   * Benennt um und bucht die Gebühr in einer Transaktion; wirft NameTakenError bzw.
   * InsufficientCreditsError.
   */
  rename(record: CharacterRecord, name: string, cost: number, at: Date): Promise<void>;
  /** Credits des Accounts in der Season. */
  balance(accountId: string, seasonId: string): Promise<number>;
  isNameTaken(seasonId: string, name: string): Promise<boolean>;
  findById(id: string): Promise<CharacterRecord | null>;
  /** Charaktere der Season, nach Name gefiltert, ohne den eigenen Account, nahe `nearLevel` zuerst. */
  search(
    seasonId: string,
    query: string,
    excludeAccountId: string,
    nearLevel: number,
    limit: number,
  ): Promise<(Pick<CharacterRecord, 'id' | 'name' | 'level' | 'classId'> & { isBot: boolean })[]>;
  /** Level aller Charaktere der Season ohne Bot-Spieler (für den Median). */
  levels(seasonId: string): Promise<number[]>;
}
