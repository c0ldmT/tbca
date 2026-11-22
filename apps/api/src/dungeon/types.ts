import type { DungeonLoot } from '@tbca/db';
import type { CombatantSnapshot } from '@tbca/game-core';

import type { EconomyChange } from '../economy/types.js';
import type { NewFight } from '../fight/types.js';

export type RunStatus = 'active' | 'left' | 'timed_out' | 'defeated' | 'saved';

export interface DungeonRun {
  id: string | null;
  seasonId: string;
  accountId: string;
  characterId: string;
  status: RunStatus;
  floor: number;
  seed: string;
  snapshot: CombatantSnapshot;
  hp: number;
  energy: number;
  injectors: number;
  backupChip: boolean;
  loot: DungeonLoot;
  xpGained: number;
  lastFightId: string | null;
  rewardDay: string;
  lastActionAt: Date;
  endedAt: Date | null;
}

/** Zugriffe innerhalb einer für den Charakter gesperrten Transaktion. */
export interface DungeonTx {
  activeRun(characterId: string): Promise<DungeonRun | null>;
  runsOnDay(characterId: string, day: string): Promise<number>;
  saveRun(run: DungeonRun): Promise<DungeonRun>;
  insertFight(f: NewFight): Promise<string>;
  economy(change: EconomyChange): Promise<void>;
  setProgress(characterId: string, xp: number, level: number): Promise<void>;
}

export interface DungeonRepository {
  locked<T>(characterId: string, fn: (tx: DungeonTx) => Promise<T>): Promise<T>;
  /** Letzter Run des Charakters (aktiv oder beendet). */
  latestRun(characterId: string): Promise<DungeonRun | null>;
  /** Aktive Runs ohne Aktion seit `before` (für den Worker). */
  idleRuns(before: Date): Promise<{ characterId: string; accountId: string }[]>;
}
