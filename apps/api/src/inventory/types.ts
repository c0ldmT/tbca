import type { EquipSlot, ItemData } from '@tbca/game-core';

export interface StoredItem {
  id: string;
  data: ItemData;
  source: string;
  createdAt: Date;
}

export interface InventoryRepository {
  listItems(accountId: string, seasonId: string): Promise<StoredItem[]>;
  countItems(accountId: string, seasonId: string): Promise<number>;
  addItems(
    accountId: string,
    seasonId: string,
    items: readonly { data: ItemData; source: string }[],
  ): Promise<string[]>;
  /** Item-IDs je Platz. */
  equipmentOf(characterId: string): Promise<Partial<Record<EquipSlot, string>>>;
  /**
   * Setzt die Belegung mehrerer Plätze in einer Transaktion (null = leeren). Ein Item, das
   * woanders steckt, wird dort entfernt.
   */
  setEquipment(
    characterId: string,
    changes: Partial<Record<EquipSlot, string | null>>,
  ): Promise<void>;
}
