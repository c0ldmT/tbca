import type { GameConfig } from '../content/types.js';

/**
 * Aufholbonus (Spezifikation, Abschnitt 11): Wer mehr als `levelGap` Level unter dem Median der
 * Season liegt, bekommt `bonusPermille` mehr XP aus aktivem Spielen (Kämpfe, Dungeon). Passive
 * XP bleiben unverändert, damit das Tageslimit für Chat-Aktivität dicht bleibt.
 */
export interface CatchUpRules {
  readonly levelGap: number;
  /** Zuschlag in Promille, 500 = +50 %. */
  readonly bonusPermille: number;
}

/** Median-Level einer Season aus den Leveln aller Charaktere (abgerundet); 0 ohne Charaktere. */
export function medianLevel(levels: readonly number[]): number {
  if (levels.length === 0) return 0;
  const sorted = [...levels].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) >> 1;
}

/** Gilt der Aufholbonus für dieses Level? `median` 0 = noch kein Median bekannt. */
export function catchUpActive(config: GameConfig, level: number, median: number): boolean {
  return median > 0 && median - level > config.catchUp.levelGap;
}

/** XP nach Aufholbonus (ganzzahlig, abgerundet). */
export function withCatchUp(config: GameConfig, xp: number, level: number, median: number): number {
  if (!catchUpActive(config, level, median)) return xp;
  return xp + Math.floor((xp * config.catchUp.bonusPermille) / 1000);
}
