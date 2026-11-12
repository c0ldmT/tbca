import type { GameConfig } from '../content/types.js';

/** XP, die von `level` zum nächsten Level nötig sind: a + b · L + c · L². */
export function xpToNext(config: GameConfig, level: number): number {
  const { a, b, c } = config.xpCurve;
  return a + b * level + c * level * level;
}

/** Gesamt-XP, die für das Erreichen von `level` nötig sind (Level 1 = 0). */
export function totalXpForLevel(config: GameConfig, level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(config, l);
  return total;
}

/** Level und Fortschritt zu einem XP-Stand, begrenzt auf maxLevel. */
export function levelFromXp(
  config: GameConfig,
  xp: number,
): { level: number; intoLevel: number; toNext: number | null } {
  let level = 1;
  let remaining = Math.max(0, xp);
  while (level < config.maxLevel && remaining >= xpToNext(config, level)) {
    remaining -= xpToNext(config, level);
    level++;
  }
  return {
    level,
    intoLevel: level === config.maxLevel ? 0 : remaining,
    toNext: level === config.maxLevel ? null : xpToNext(config, level),
  };
}
