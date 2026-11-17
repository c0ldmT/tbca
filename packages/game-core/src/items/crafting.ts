import type { GameConfig } from '../content/types.js';
import { roundDiv } from '../math/fixed.js';
import type { Xoshiro128ss } from '../random/prng.js';
import { findTemplate, itemBudget, rarityTier } from './items.js';
import type { ItemData, ItemStat, MaterialId } from './types.js';

export class CraftingError extends Error {
  override readonly name = 'CraftingError';
  constructor(
    readonly code:
      'max_upgrade' | 'affix_missing' | 'affix_present' | 'affix_not_allowed' | 'too_many_affixes',
    message: string,
  ) {
    super(message);
  }
}

export type MaterialCost = Partial<Record<MaterialId, number>>;

/** Item mit angewendeter Aufwertung: alle Werte +3 % je Stufe (abgerundet). */
export function effectiveItem(config: GameConfig, item: ItemData): ItemData {
  const level = item.upgrade ?? 0;
  if (level === 0) return item;
  const factor = 1000 + config.crafting.upgrade.bonusPerLevelPermille * level;
  const scale = (v: number) => Math.floor((v * factor) / 1000);
  return {
    ...item,
    budget: scale(item.budget),
    base: Object.fromEntries(Object.entries(item.base).map(([k, v]) => [k, scale(v)])),
    affixes: item.affixes.map((a) => ({ ...a, value: scale(a.value) })),
  };
}

/** Wert eines Items in Credits (Grundlage für Shop-Preis und Verkauf). */
export function itemValue(config: GameConfig, item: ItemData): number {
  return effectiveItem(config, item).budget * config.shop.priceCreditsPerBudget;
}

/** Zerlegen: Materialien nach Tier und Item-Level. */
export function salvageYield(config: GameConfig, item: ItemData): MaterialCost {
  const tier = rarityTier(item.rarity);
  const result: MaterialCost = {};
  for (const band of config.crafting.salvage) {
    if (tier < band.minTier) continue;
    result[band.material] =
      (result[band.material] ?? 0) + band.base + Math.floor(item.itemLevel / band.perLevels);
  }
  return result;
}

export interface UpgradeCost {
  credits: number;
  materials: MaterialCost;
  /** Erfolgschance in Promille. */
  successPermille: number;
}

export function upgradeCost(config: GameConfig, item: ItemData): UpgradeCost {
  const rules = config.crafting.upgrade;
  const next = (item.upgrade ?? 0) + 1;
  if (next > rules.maxLevel) throw new CraftingError('max_upgrade', 'Höchste Stufe erreicht');
  return {
    credits:
      rules.credits.base +
      rules.credits.perItemLevel * item.itemLevel +
      rules.credits.perUpgrade * next,
    materials: { [rules.material[next - 1]!]: 1 + Math.floor(next / 2) },
    successPermille: rules.successPermille[next - 1] ?? 0,
  };
}

/** Aufwerten um eine Stufe; ab +6 kann es scheitern, dann sinkt die Stufe um 1. Nie zerstört. */
export function upgradeItem(
  config: GameConfig,
  item: ItemData,
  rng: Xoshiro128ss,
): { item: ItemData; success: boolean } {
  const cost = upgradeCost(config, item);
  const current = item.upgrade ?? 0;
  const success = rng.chance(cost.successPermille, 1000);
  return { item: { ...item, upgrade: success ? current + 1 : Math.max(0, current - 1) }, success };
}

/** Budgetanteil eines einzelnen Affixes für ein Item (wie beim Würfeln). */
export function affixShare(
  config: GameConfig,
  item: Pick<ItemData, 'category' | 'itemLevel' | 'rarity'>,
): number {
  const rules = config.items;
  const budget = itemBudget(config, item.category, item.itemLevel, item.rarity);
  const baseBudget = roundDiv(budget * rules.baseSharePermille[item.category], 1000);
  const tier = rarityTier(item.rarity);
  const [, max] = rules.affixCount[Math.min(tier, rules.affixCount.length) - 1]!;
  return Math.floor((budget - baseBudget) / Math.max(1, max));
}

export function transferCost(
  config: GameConfig,
  target: ItemData,
): { credits: number; successPermille: number } {
  const rules = config.crafting.transfer;
  return {
    credits: rules.credits.base + rules.credits.perItemLevel * target.itemLevel,
    successPermille: rules.successPermille[target.affixes.length] ?? 0,
  };
}

/**
 * Affix-Übertragung: Der Spender wird geopfert; bei Erfolg erhält das Ziel den Affix mit gleicher
 * Qualität (Anteil am jeweiligen Budget), sonst bleibt es unverändert.
 */
export function transferAffix(
  config: GameConfig,
  target: ItemData,
  donor: ItemData,
  stat: ItemStat,
  rng: Xoshiro128ss,
): { item: ItemData; success: boolean } {
  const affix = donor.affixes.find((a) => a.stat === stat);
  if (!affix) throw new CraftingError('affix_missing', 'Der Spender hat diesen Affix nicht');
  if (target.affixes.some((a) => a.stat === stat)) {
    throw new CraftingError('affix_present', 'Das Ziel hat diesen Affix schon');
  }
  if (!findTemplate(config, target.templateId).affixPool.includes(stat)) {
    throw new CraftingError('affix_not_allowed', 'Dieser Affix passt nicht zum Ziel');
  }
  const { successPermille } = transferCost(config, target);
  if (successPermille === 0)
    throw new CraftingError('too_many_affixes', 'Das Ziel hat zu viele Affixe');

  const success = rng.chance(successPermille, 1000);
  if (!success) return { item: target, success };
  const cost = config.items.statCost[stat];
  const quality = Math.min(
    1000,
    Math.max(
      config.items.affixRollMinPermille,
      Math.floor((affix.value * cost * 1000) / Math.max(1, affixShare(config, donor))),
    ),
  );
  const value = Math.max(1, Math.floor((affixShare(config, target) * quality) / 1000 / cost));
  return { item: { ...target, affixes: [...target.affixes, { stat, value }] }, success };
}

export function rerollCost(
  config: GameConfig,
  item: ItemData,
): { credits: number; materials: MaterialCost } {
  const rules = config.crafting.reroll;
  return {
    credits: rules.credits.base + rules.credits.perItemLevel * item.itemLevel,
    materials: { [rules.material]: rules.materialAmount },
  };
}

/** Würfelt einen einzelnen Affix neu: neuer Wert aus dem Pool, ohne doppelte Affixe. */
export function rerollAffix(
  config: GameConfig,
  item: ItemData,
  stat: ItemStat,
  rng: Xoshiro128ss,
): ItemData {
  const index = item.affixes.findIndex((a) => a.stat === stat);
  if (index < 0) throw new CraftingError('affix_missing', 'Das Item hat diesen Affix nicht');
  const others = new Set(item.affixes.filter((_, i) => i !== index).map((a) => a.stat));
  const pool = findTemplate(config, item.templateId).affixPool.filter((s) => !others.has(s));
  const next = pool[rng.nextInt(pool.length)]!;
  const roll = rng.nextRange(config.items.affixRollMinPermille, 1000);
  const value = Math.max(
    1,
    Math.floor((affixShare(config, item) * roll) / 1000 / config.items.statCost[next]),
  );
  return {
    ...item,
    affixes: item.affixes.map((a, i) => (i === index ? { stat: next, value } : a)),
  };
}
