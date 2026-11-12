import { affixShare, type GameConfig, type ItemData, type ItemStat } from '@tbca/game-core';
import { tierOf } from '@tbca/assets';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Beschriftung eines Item-Werts (Attribute heißen wie Attribute). */
export function statLabel(stat: string, t: Translate): string {
  if (stat === 'weaponDamage') return t('itemStats.weaponDamage');
  return t(
    ['str', 'dex', 'int', 'con'].includes(stat) ? `attributes.${stat}` : `itemStats.${stat}`,
  );
}

/** Wert mit Einheit: Schaden in Prozent (0,1 % je Punkt), Crit-Chance in Promille. */
export function statValue(stat: string, value: number, locale?: string): string {
  if ((stat as ItemStat) === 'damageDealt') {
    return `${(value / 10).toLocaleString(locale, { maximumFractionDigits: 1 })} %`;
  }
  if ((stat as ItemStat) === 'critChance') return `${value} ‰`;
  return value.toLocaleString(locale);
}

/**
 * Würfelqualität eines Affixes in Promille seines Budgetanteils (700–1000). Basis ist der
 * Rohwert ohne Aufwertung.
 */
export function affixQuality(
  config: GameConfig,
  item: ItemData,
  stat: ItemStat,
  value: number,
): number {
  const share = affixShare(config, item);
  const cost = config.items.statCost[stat];
  if (share <= 0 || !cost) return 1000;
  return Math.max(700, Math.min(1000, Math.floor((value * cost * 1000) / share)));
}

/** Breite des Qualitätsbalkens: 70 % = leer, 100 % = voll, mindestens ein Stück sichtbar. */
export function qualityPercent(quality: number): number {
  return Math.max(8, Math.round(((quality - 700) / 300) * 100));
}

export function tier(rarity: number): number {
  return tierOf(Math.max(1, rarity));
}
