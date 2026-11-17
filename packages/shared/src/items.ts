import type { EquipSlot, ItemCategory, ItemData } from '@tbca/game-core';
import { z } from 'zod';

/** PUT /api/inventory/equipment/:slot */
export const equipRequestSchema = z.object({ itemId: z.uuid() });

export interface ItemView extends ItemData {
  id: string;
  source: string;
  createdAt: string;
  equippedIn: EquipSlot | null;
}

/** GET /api/inventory */
export interface InventoryView {
  items: ItemView[];
  /** Item-ID je belegtem Platz. */
  equipment: Partial<Record<EquipSlot, string>>;
  /** Materialien und Verbrauchsgüter. */
  stacks: Record<string, number>;
  /** Welche Plätze je Kategorie erlaubt sind. */
  slotsByCategory: Record<ItemCategory, EquipSlot[]>;
}
