import { equipment, itemInstance, type Database } from '@tbca/db';
import type { EquipSlot, ItemData } from '@tbca/game-core';
import { and, asc, count, eq } from 'drizzle-orm';

import type { InventoryRepository, StoredItem } from './types.js';

export class DrizzleInventoryRepository implements InventoryRepository {
  constructor(private readonly db: Database) {}

  async listItems(accountId: string, seasonId: string): Promise<StoredItem[]> {
    const rows = await this.db
      .select()
      .from(itemInstance)
      .where(and(eq(itemInstance.accountId, accountId), eq(itemInstance.seasonId, seasonId)))
      .orderBy(asc(itemInstance.createdAt));
    return rows.map((r) => ({ id: r.id, data: r.data, source: r.source, createdAt: r.createdAt }));
  }

  async countItems(accountId: string, seasonId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(itemInstance)
      .where(and(eq(itemInstance.accountId, accountId), eq(itemInstance.seasonId, seasonId)));
    return row?.n ?? 0;
  }

  async addItems(
    accountId: string,
    seasonId: string,
    items: readonly { data: ItemData; source: string }[],
  ): Promise<string[]> {
    if (items.length === 0) return [];
    const rows = await this.db
      .insert(itemInstance)
      .values(
        items.map((i) => ({
          accountId,
          seasonId,
          templateId: i.data.templateId,
          itemLevel: i.data.itemLevel,
          rarity: i.data.rarity,
          budget: i.data.budget,
          data: i.data,
          source: i.source,
        })),
      )
      .returning({ id: itemInstance.id });
    return rows.map((r) => r.id);
  }

  async equipmentOf(characterId: string): Promise<Partial<Record<EquipSlot, string>>> {
    const rows = await this.db
      .select()
      .from(equipment)
      .where(eq(equipment.characterId, characterId));
    return Object.fromEntries(rows.map((r) => [r.slot, r.itemId]));
  }

  async setEquipment(
    characterId: string,
    changes: Partial<Record<EquipSlot, string | null>>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [slot, itemId] of Object.entries(changes) as [EquipSlot, string | null][]) {
        await tx
          .delete(equipment)
          .where(and(eq(equipment.characterId, characterId), eq(equipment.slot, slot)));
        if (itemId) {
          await tx.delete(equipment).where(eq(equipment.itemId, itemId));
          await tx.insert(equipment).values({ characterId, slot, itemId });
        }
      }
    });
  }
}
