import type { GameConfig } from '../content/types.js';
import type { Xoshiro128ss } from '../random/prng.js';

/** Aktivitäts-XP aus Chat (Spezifikation, Abschnitt 11). */
export interface PassiveXpRules {
  readonly message: {
    readonly minXp: number;
    readonly maxXp: number;
    readonly minLength: number;
    /** Höchstens eine belohnte Nachricht je Identität in diesem Abstand. */
    readonly cooldownMs: number;
    /** So lange zählt eine (fast) gleiche Nachricht als Wiederholung. */
    readonly repeatWindowMs: number;
  };
  /**
   * Globales passives Tageslimit pro Account, abhängig vom Level: bis `soft` volle XP,
   * bis `hard` die Hälfte, danach nichts.
   */
  readonly dailyCap: {
    readonly soft: { readonly base: number; readonly perLevel: number };
    readonly hard: { readonly base: number; readonly perLevel: number };
    readonly overSoftPermille: number;
  };
}

/** XP für eine Chat-Nachricht vor Deckelung; 0 bei zu kurzen Nachrichten. */
export function messageXp(config: GameConfig, length: number, rng: Xoshiro128ss): number {
  const rules = config.passiveXp.message;
  if (length < rules.minLength) return 0;
  return rng.nextRange(rules.minXp, rules.maxXp);
}

export interface PassiveCapResult {
  /** Tatsächlich gutgeschriebene XP. */
  readonly awarded: number;
  /** Neuer Stand der ungedeckelten Tagessumme. */
  readonly rawToday: number;
}

/**
 * Wendet das passive Tageslimit an. `rawToday` ist die Summe aller passiven Roh-XP des Tages vor
 * dieser Gutschrift; gilt für alle Communities und Plattformen eines Accounts gemeinsam.
 */
export function applyPassiveCap(
  config: GameConfig,
  input: { level: number; rawToday: number; amount: number },
): PassiveCapResult {
  const cap = config.passiveXp.dailyCap;
  const soft = cap.soft.base + cap.soft.perLevel * input.level;
  const hard = Math.max(soft, cap.hard.base + cap.hard.perLevel * input.level);
  // Gutschrift = f(neu) − f(alt): Über den Tag summiert gehen keine Rundungsreste verloren.
  const credited = (raw: number) =>
    Math.min(raw, soft) +
    Math.floor(((Math.min(Math.max(raw, soft), hard) - soft) * cap.overSoftPermille) / 1000);
  const to = Math.min(input.rawToday + input.amount, hard);
  return { awarded: credited(to) - credited(input.rawToday), rawToday: to };
}
