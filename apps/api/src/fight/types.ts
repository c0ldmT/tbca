import type { BattleInput, BattleResult } from '@tbca/game-core';

export type FightKind = 'pvp_rated' | 'pvp_friendly' | 'training';

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
  /** Davon gegen den jeweiligen Gegner. */
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
  rewardCounts(characterId: string, day: string): Promise<RewardCounts>;
  findById(id: string): Promise<StoredFight | null>;
  listForCharacter(characterId: string, limit: number): Promise<StoredFight[]>;
}
