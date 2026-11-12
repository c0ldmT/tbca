import type { BattleInput, BattleResult } from '@tbca/game-core';

export type FightKind =
  | 'pvp_rated'
  | 'pvp_friendly'
  | 'training'
  | 'dungeon'
  | 'team_rated'
  | 'team_friendly'
  | 'league'
  | 'team_league';

export interface NewFight {
  seasonId: string;
  kind: FightKind;
  seed: string;
  configVersion: number;
  input: Omit<BattleInput, 'engineVersion' | 'configVersion' | 'seed'>;
  result: BattleResult;
  rewardDay: string;
  participants: {
    team: number;
    slot: number;
    characterId: string | null;
    initiator: boolean;
    won: boolean;
    rewarded: boolean;
    xpAwarded: number;
    creditsAwarded: number;
    opponentCharacterId: string | null;
    opponentTeamId?: string | null;
  }[];
}

export interface StoredFight extends Omit<NewFight, 'result'> {
  id: string;
  createdAt: Date;
  engineVersion: number;
  result: Pick<BattleResult, 'winner' | 'reason' | 'rounds' | 'logHash' | 'events'>;
}

export interface RewardCounts {
  /** Belohnte Kämpfe des Charakters am Tag. */
  today: number;
  /** Davon gegen den jeweiligen Gegner (Charakter- bzw. Team-ID). */
  byOpponent: Map<string, number>;
}

/** Schreibzugriffe innerhalb einer Transaktion, die für einen Charakter gesperrt ist. */
export interface FightTx {
  rewardCounts(characterId: string, day: string): Promise<RewardCounts>;
  insert(fight: NewFight): Promise<string>;
  /** Setzt XP und Level eines Charakters. */
  setProgress(characterId: string, xp: number, level: number): Promise<void>;
  /** Bucht eine PvP-Belohnung vom Systemkonto auf den Spieler. */
  rewardCredits(
    seasonId: string,
    accountId: string,
    amount: number,
    fightId: string,
  ): Promise<void>;
}

export interface FightRepository {
  /** Führt `fn` in einer Transaktion aus, in der parallele Kämpfe desselben Charakters warten. */
  locked<T>(characterId: string, fn: (tx: FightTx) => Promise<T>): Promise<T>;
  /** Wie `locked`, für mehrere Charaktere (Team-Kämpfe); Sperren in fester Reihenfolge. */
  lockedMany<T>(characterIds: readonly string[], fn: (tx: FightTx) => Promise<T>): Promise<T>;
  rewardCounts(characterId: string, day: string): Promise<RewardCounts>;
  findById(id: string): Promise<StoredFight | null>;
  listForCharacter(characterId: string, limit: number): Promise<StoredFight[]>;
}

export interface ChallengeRequestRecord {
  id: string;
  seasonId: string;
  challengerId: string;
  opponentId: string;
  mode: 'rated' | 'friendly';
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: Date;
  fightId: string | null;
  createdAt: Date;
}

export interface DailyOpponents {
  ids: string[];
  rerolled: boolean;
}

export interface TeamChallengeRequestRecord {
  id: string;
  seasonId: string;
  challengerTeamId: string;
  opponentTeamId: string;
  requesterAccountId: string;
  size: 2 | 3;
  lineup: string[];
  mode: 'rated' | 'friendly';
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: Date;
  fightId: string | null;
  createdAt: Date;
}

/** Tagesgegner und Herausforderungen mit Annahme. */
export interface PvpRepository {
  /** Auswahl des Tages in fester Reihenfolge; leer, wenn es noch keine gibt. */
  dailyOpponents(characterId: string, day: string): Promise<DailyOpponents>;
  /** Speichert die Auswahl, falls es für den Tag noch keine gibt, und liefert die gültige. */
  saveDailyOpponents(
    characterId: string,
    day: string,
    ids: readonly string[],
  ): Promise<DailyOpponents>;
  /**
   * Ersetzt die Auswahl gegen Credits (einmal am Tag) in einer Transaktion. False, wenn heute
   * schon neu gewürfelt wurde; wirft InsufficientCreditsError ohne genug Credits.
   */
  rerollDailyOpponents(input: {
    characterId: string;
    day: string;
    ids: readonly string[];
    charge: { seasonId: string; accountId: string; amount: number };
  }): Promise<boolean>;
  createRequest(
    input: Pick<
      ChallengeRequestRecord,
      'seasonId' | 'challengerId' | 'opponentId' | 'mode' | 'expiresAt'
    >,
  ): Promise<ChallengeRequestRecord>;
  findRequest(id: string): Promise<ChallengeRequestRecord | null>;
  /** Offene Anfrage zwischen zwei Charakteren (in dieser Richtung). */
  pendingRequest(challengerId: string, opponentId: string): Promise<ChallengeRequestRecord | null>;
  /** Wechselt nur aus „pending“; false, wenn schon entschieden. */
  resolveRequest(id: string, status: 'accepted' | 'declined' | 'expired'): Promise<boolean>;
  /** Kampf einer angenommenen Anfrage vermerken. */
  setRequestFight(id: string, fightId: string): Promise<void>;

  /** Gegnerische Tages-Teams eines Teams; leer, wenn es noch keine gibt. */
  dailyTeamOpponents(teamId: string, day: string): Promise<string[]>;
  saveDailyTeamOpponents(teamId: string, day: string, ids: readonly string[]): Promise<string[]>;
  createTeamRequest(
    input: Pick<
      TeamChallengeRequestRecord,
      | 'seasonId'
      | 'challengerTeamId'
      | 'opponentTeamId'
      | 'requesterAccountId'
      | 'size'
      | 'lineup'
      | 'mode'
      | 'expiresAt'
    >,
  ): Promise<TeamChallengeRequestRecord>;
  findTeamRequest(id: string): Promise<TeamChallengeRequestRecord | null>;
  pendingTeamRequest(
    challengerTeamId: string,
    opponentTeamId: string,
    size: 2 | 3,
  ): Promise<TeamChallengeRequestRecord | null>;
  /** Wechselt nur aus „pending“; false, wenn schon entschieden. */
  resolveTeamRequest(id: string, status: 'accepted' | 'declined' | 'expired'): Promise<boolean>;
  setTeamRequestFight(id: string, fightId: string): Promise<void>;
}
