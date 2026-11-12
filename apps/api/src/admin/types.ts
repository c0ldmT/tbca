import type { CombatantSnapshot, ItemData } from '@tbca/game-core';

export interface AuditEntry {
  id: string;
  actorAccountId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  data: Record<string, unknown>;
  createdAt: Date;
}

export interface AccountOverview {
  accountId: string;
  identities: { provider: string; displayName: string; providerUserId: string }[];
  character: { id: string; name: string; level: number; xp: number } | null;
  globalRole: 'player' | 'superadmin';
  isBot: boolean;
  bannedAt: Date | null;
  bannedReason: string | null;
}

export interface AdminRepository {
  audit(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void>;
  auditLog(limit: number): Promise<AuditEntry[]>;
  /** Accounts nach Anzeige- oder Charaktername in der Season. */
  searchAccounts(seasonId: string, query: string, limit: number): Promise<AccountOverview[]>;
  setBan(accountId: string, reason: string | null): Promise<boolean>;
  setProgress(characterId: string, xp: number, level: number): Promise<void>;
  /** Sessions eines Accounts beenden (z. B. bei Sperre). */
  revokeSessions(accountId: string): Promise<void>;
}

export interface SeasonStats {
  characters: number;
  bots: number;
  /** Charaktere mit mindestens einem Kampf oder Dungeon-Run am Tag. */
  playedToday: number;
  dungeonRunsToday: number;
  activeRuns: number;
  rewardedFightsToday: number;
  passiveXpToday: number;
}

export interface DailyResetEntry {
  kind: 'dungeon' | 'fights';
  characterName: string | null;
  createdAt: Date;
}

export interface SeasonResetCounts {
  characters: number;
  fights: number;
  runs: number;
  items: number;
}

/** Steuerung der laufenden Season (Abschnitt 13). */
export interface SeasonAdminRepository {
  info(seasonId: string): Promise<{ slug: string; startsAt: Date; endsAt: Date } | null>;
  stats(seasonId: string, day: string): Promise<SeasonStats>;
  resetsOn(seasonId: string, day: string): Promise<DailyResetEntry[]>;
  /**
   * Tageslimits zurücksetzen: Dungeon-Runs und belohnte Kämpfe per Rücksetzungs-Eintrag,
   * passive XP über den Tageszähler. Ohne Account für alle der Season.
   */
  resetDaily(input: {
    seasonId: string;
    day: string;
    kinds: readonly ('dungeon' | 'fights' | 'passive')[];
    account: { accountId: string; characterId: string } | null;
  }): Promise<void>;
  /**
   * progress: alle Charaktere zurück auf Level 1 ohne Punkte, Items, Credits, Kämpfe und
   * Runs; wipe: zusätzlich Spieler-Charaktere löschen (Bots bleiben auf Level 1).
   */
  resetSeason(seasonId: string, mode: 'progress' | 'wipe'): Promise<SeasonResetCounts>;
  setEnd(seasonId: string, endsAt: Date): Promise<void>;
}

/** Rohdaten für den anonymisierten Plattform-Export (Balancing-Auswertung). */
export interface ExportRows {
  characters: {
    id: string;
    isBot: boolean;
    classId: string;
    level: number;
    xp: number;
    allocated: { str: number; dex: number; int: number; con: number };
    createdAt: Date;
    loadout: { abilities: string[]; tactics: unknown[] } | null;
    equipment: { slot: string; item: ItemData }[];
  }[];
  fights: {
    kind: string;
    createdAt: Date;
    rewardDay: string;
    configVersion: number;
    engineVersion: number;
    rounds: number;
    winnerTeam: number | null;
    reason: string;
    teams: readonly (readonly CombatantSnapshot[])[];
    participants: {
      team: number;
      slot: number;
      characterId: string | null;
      won: boolean;
      rewarded: boolean;
      xpAwarded: number;
      creditsAwarded: number;
    }[];
  }[];
  runs: {
    characterId: string;
    classId: string | null;
    level: number;
    floor: number;
    status: string;
    xpGained: number;
    lootCredits: number;
    lootItems: number;
    injectors: number;
    backupChip: boolean;
    rewardDay: string;
  }[];
  credits: { kind: string; transactions: number; toPlayers: number; fromPlayers: number }[];
  items: { templateId: string; rarity: number; source: string; count: number }[];
  purchases: { day: string; offerId: string; count: number }[];
  passive: { day: string; accounts: number; raw: number; awarded: number; messages: number }[];
}

export interface AdminExportRepository {
  /** Daten der Season; Kämpfe und Runs ab `since`, höchstens `limit` Kämpfe (neueste zuerst). */
  rows(seasonId: string, since: Date, limit: number): Promise<ExportRows>;
}
