import { ITEM_STATS, type ConsumableId, type ItemData } from '@tbca/game-core';
import { z } from 'zod';

import type { ItemView } from './items.js';

export const craftItemSchema = z.object({ itemId: z.uuid() });
export const craftAffixSchema = z.object({ itemId: z.uuid(), stat: z.enum(ITEM_STATS) });
export const transferRequestSchema = z.object({
  targetId: z.uuid(),
  donorId: z.uuid(),
  stat: z.enum(ITEM_STATS),
});
export const shopBuySchema = z.object({ offerId: z.string().min(1).max(64) });

export interface CraftingResult {
  success: boolean;
  /** Erhaltene Materialien (Zerlegen). */
  gained: Record<string, number>;
  item: ItemView | null;
  stacks: Record<string, number>;
  credits: number;
}

export interface ShopView {
  day: string;
  credits: number;
  stacks: Record<string, number>;
  consumables: { offerId: string; consumable: ConsumableId; price: number }[];
  rotation: { offerId: string; item: ItemData; price: number; sold: boolean }[];
  sellPermille: number;
}
