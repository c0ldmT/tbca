import type { AbilityDef, Effect } from '@tbca/game-core';

/** Eine Effektbeschreibung als Übersetzungsschlüssel mit Parametern. */
export interface EffectLine {
  key: string;
  params: Record<string, string | number>;
}

const percent = (fixed: number) => Math.round(fixed / 100);

/** Beschreibt die Effekte einer Fähigkeit aus ihren Daten – ohne handgeschriebene Texte. */
export function describeEffects(ability: AbilityDef): EffectLine[] {
  return ability.effects.map((effect: Effect): EffectLine => {
    switch (effect.type) {
      case 'damage':
        return {
          key: (effect.hits ?? 1) > 1 ? 'effect.damageHits' : 'effect.damage',
          params: { percent: percent(effect.multiplier), hits: effect.hits ?? 1 },
        };
      case 'heal':
        return { key: 'effect.heal', params: { base: effect.amount.base } };
      case 'shield':
        return { key: 'effect.shield', params: { base: effect.amount.base, turns: effect.turns } };
      case 'stun':
        return {
          key: 'effect.stun',
          params: { chance: Math.round(effect.chance / 10), turns: effect.turns },
        };
      case 'dot':
        return {
          key: 'effect.dot',
          params: { percent: percent(effect.multiplier), turns: effect.turns },
        };
      case 'modifier': {
        const [name, value] = Object.entries(effect.modifiers)[0] ?? ['damageDealt', 0];
        return {
          key: `effect.modifier.${name}`,
          params: {
            percent: Math.abs(percent(value)),
            sign: value >= 0 ? '+' : '−',
            turns: effect.turns,
          },
        };
      }
      case 'taunt':
        return { key: 'effect.taunt', params: { turns: effect.turns } };
      case 'energy_drain':
        return { key: 'effect.drain', params: { amount: effect.amount } };
      case 'cleanse':
        return { key: 'effect.cleanse', params: {} };
    }
  });
}
