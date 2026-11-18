import type { DungeonModifier, ItemData } from '@tbca/game-core';
import { z } from 'zod';

/** POST /api/dungeon/start */
export const dungeonStartSchema = z.object({
  injectors: z.number().int().min(0).max(10),
  backupChip: z.boolean(),
});
export type DungeonStartRequest = z.infer<typeof dungeonStartSchema>;

export interface DungeonRunView {
  id: string;
  status: 'active' | 'left' | 'timed_out' | 'defeated' | 'saved';
  floor: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  injectors: number;
  backupChip: boolean;
  loot: { items: ItemData[]; credits: number };
  xpGained: number;
  lastFightId: string | null;
  /** Vorschau der nächsten Etage. */
  next: { floor: number; monsterLevel: number; boss: boolean; modifiers: DungeonModifier[] } | null;
  /** Spätester Zeitpunkt (ISO) für die Entscheidung, danach automatischer Ausstieg. */
  decideBy: string | null;
}

export interface DungeonView {
  runsToday: number;
  runsPerDay: number;
  fee: number;
  stacks: Record<string, number>;
  maxInjectors: number;
  run: DungeonRunView | null;
}
