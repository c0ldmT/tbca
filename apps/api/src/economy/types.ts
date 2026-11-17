import type { SystemAccount } from '@tbca/db';
import type { ItemData } from '@tbca/game-core';

/** Eine wirtschaftliche Änderung, die als Ganzes gelingt oder gar nicht. */
export interface EconomyChange {
  seasonId: string;
  accountId: string;
  /** Betrag aus Sicht des Spielers (negativ = Kosten); Gegenbuchung auf dem Systemkonto. */
  credits?: { amount: number; kind: string; system: SystemAccount; refId?: string | null };
  stacks?: Readonly<Record<string, number>>;
  updateItems?: readonly { id: string; data: ItemData }[];
  /** Nur eigene, nicht ausgerüstete Items. */
  deleteItems?: readonly string[];
  addItems?: readonly { data: ItemData; source: string }[];
  /** Einmaliger Kauf eines Rotationsangebots. */
  purchase?: { day: string; offerId: string };
}

export class ItemEquippedError extends Error {
  override readonly name = 'ItemEquippedError';
}

export class AlreadyPurchasedError extends Error {
  override readonly name = 'AlreadyPurchasedError';
}

export interface EconomyRepository {
  commit(change: EconomyChange): Promise<{ addedIds: string[] }>;
  stacks(accountId: string, seasonId: string): Promise<Record<string, number>>;
  purchases(accountId: string, seasonId: string, day: string): Promise<string[]>;
}
