import type { GameConfig } from '../content/types.js';
import { roundDiv } from '../math/fixed.js';

/** Warum ein Kampf keine oder weniger Belohnung bringt; für Anzeige und Logs. */
export type RewardLimit = 'none' | 'friendly' | 'daily_limit' | 'level_gap' | 'same_opponent';

export interface PvpRewardInput {
  readonly mode: 'rated' | 'friendly';
  readonly won: boolean;
  readonly level: number;
  readonly opponentLevel: number;
  /** Bereits belohnte gewertete Kämpfe heute (vor diesem). */
  readonly rewardedToday: number;
  /** Bereits belohnte Kämpfe heute gegen denselben Gegner (vor diesem). */
  readonly rewardedVsOpponentToday: number;
}

export interface PvpReward {
  readonly xp: number;
  /** Ob der Kampf als belohnter Kampf zählt (Tageslimit). */
  readonly rewarded: boolean;
  /** Angewendeter Faktor in Promille (Gegner-Abnahme × Underdog). */
  readonly factor: number;
  readonly limit: RewardLimit;
  /** Underdog-Bonus in Promille, 0 ohne. */
  readonly underdogBonus: number;
}

const NONE = (limit: RewardLimit): PvpReward => ({
  xp: 0,
  rewarded: false,
  factor: 0,
  limit,
  underdogBonus: 0,
});

/**
 * Belohnung einer Herausforderung (Spezifikation, Abschnitt 9):
 * höchstens N belohnte Kämpfe pro Tag, nichts gegen Gegner mehr als X Level darunter,
 * Underdog-Bonus gegen Stärkere, abnehmend gegen denselben Gegner (100 %, 50 %, 0 %).
 * Freundschaftskämpfe bringen nie etwas.
 */
export function pvpReward(config: GameConfig, input: PvpRewardInput): PvpReward {
  const rules = config.pvp;
  if (input.mode === 'friendly') return NONE('friendly');
  if (input.rewardedToday >= rules.dailyRewardedFights) return NONE('daily_limit');
  if (input.level - input.opponentLevel > rules.maxLevelsBelow) return NONE('level_gap');
  const repeat = rules.sameOpponentPermille[input.rewardedVsOpponentToday] ?? 0;
  if (repeat === 0) return NONE('same_opponent');

  const levelsAbove = Math.max(0, input.opponentLevel - input.level);
  const underdogBonus = input.won
    ? Math.min(rules.underdogMaxPermille, levelsAbove * rules.underdogPerLevelPermille)
    : 0;
  const factor = roundDiv(repeat * (1000 + underdogBonus), 1000);
  const base = rules.winXp.base + rules.winXp.perOpponentLevel * input.opponentLevel;
  const full = input.won ? base : roundDiv(base * rules.lossXpPermille, 1000);
  return {
    xp: roundDiv(full * factor, 1000),
    rewarded: true,
    factor,
    limit: repeat < 1000 ? 'same_opponent' : 'none',
    underdogBonus,
  };
}
