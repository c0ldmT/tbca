import type { Attribute, GameConfig, Modifiers } from '../content/types.js';
import { roundDiv, type Fixed } from '../math/fixed.js';
import { Xoshiro128ss, type Seed } from '../random/prng.js';
import { effectiveItem } from './crafting.js';
import type { EquipSlot, ItemCategory, ItemData, ItemStat, ItemTemplate } from './types.js';

/**
 * Rarität-Faktor 1 + 0,35 · ln(Rarität) als Festkomma-Tabelle (Spezifikation, Abschnitt 7).
 * Vorberechnet, weil Math.log sich zwischen JS-Engines unterscheiden darf. Rarität ist nach oben
 * offen; jenseits der Tabelle gilt der letzte Wert (abnehmender Ertrag).
 */
const RARITY_FACTOR: readonly Fixed[] = [
  10000, 12426, 13845, 14852, 15633, 16271, 16811, 17278, 17690, 18059, 18393, 18697, 18977, 19237,
  19478, 19704, 19916, 20116, 20306, 20485, 20656, 20819, 20974, 21123, 21266, 21403, 21535, 21663,
  21786, 21904, 22019, 22130, 22238, 22342, 22444, 22542, 22638, 22732, 22822, 22911, 22998, 23082,
  23164, 23245, 23323, 23400, 23476, 23549, 23621, 23692, 23761, 23829, 23896, 23961, 24026, 24089,
  24151, 24212, 24271, 24330, 24388, 24445, 24501, 24556,
];

export function rarityFactor(rarity: number): Fixed {
  if (!Number.isSafeInteger(rarity) || rarity < 1)
    throw new RangeError(`Ungültige Rarität: ${rarity}`);
  return RARITY_FACTOR[Math.min(rarity, RARITY_FACTOR.length) - 1]!;
}

/** Tier einer Rarität: aufgerundet Rarität / 3. */
export function rarityTier(rarity: number): number {
  return Math.ceil(rarity / 3);
}

/** Power-Budget = B_Slot · Item-Level · (1 + 0,35 · ln(Rarität)), ganzzahlig. */
export function itemBudget(
  config: GameConfig,
  category: ItemCategory,
  itemLevel: number,
  rarity: number,
): number {
  return roundDiv(config.items.categoryBudget[category] * itemLevel * rarityFactor(rarity), 10_000);
}

export class ItemError extends Error {
  override readonly name = 'ItemError';
  constructor(
    readonly code:
      'unknown_template' | 'invalid_item' | 'wrong_slot' | 'two_handed_blocks_off_hand',
    message: string,
  ) {
    super(message);
  }
}

export function findTemplate(config: GameConfig, templateId: string): ItemTemplate {
  const template = config.items.templates.find((t) => t.id === templateId);
  if (!template) throw new ItemError('unknown_template', `Unbekannte Item-Vorlage: ${templateId}`);
  return template;
}

export interface RollItemInput {
  readonly templateId: string;
  readonly itemLevel: number;
  readonly rarity: number;
  readonly seed: Seed;
}

/**
 * Würfelt ein Item: Basiswerte aus dem Basis-Anteil des Budgets, dazu Affixe aus dem Pool der
 * Vorlage, je 70–100 % ihres Budgetanteils. Gleicher Seed, gleiches Item.
 */
export function rollItem(config: GameConfig, input: RollItemInput): ItemData {
  const rules = config.items;
  const template = findTemplate(config, input.templateId);
  if (!Number.isSafeInteger(input.itemLevel) || input.itemLevel < 1) {
    throw new ItemError('invalid_item', `Ungültiges Item-Level: ${input.itemLevel}`);
  }
  const rng = Xoshiro128ss.fromSeed(input.seed);
  const budget = itemBudget(config, template.category, input.itemLevel, input.rarity);
  const baseBudget = roundDiv(budget * rules.baseSharePermille[template.category], 1000);

  // Basiswerte nach Gewichten der Vorlage.
  const base: Partial<Record<ItemStat | 'weaponDamage', number>> = {};
  const weights = Object.entries(template.base) as [ItemStat | 'weaponDamage', number][];
  const totalWeight = weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [stat, weight] of weights) {
    const share = totalWeight > 0 ? Math.floor((baseBudget * weight) / totalWeight) : 0;
    const value = Math.floor(share / rules.statCost[stat]);
    base[stat] = stat === 'weaponDamage' ? rules.weaponDamageFloor + value : value;
  }

  // Affixe: Anzahl nach Tier, Anteil = Affix-Budget / größtmögliche Anzahl.
  const tier = rarityTier(input.rarity);
  const [min, max] = rules.affixCount[Math.min(tier, rules.affixCount.length) - 1]!;
  const affixOnly = rules.baseSharePermille[template.category] === 0;
  const count = Math.min(
    template.affixPool.length,
    Math.max(affixOnly ? 1 : 0, rng.nextRange(min, max)),
  );
  const share = Math.floor((budget - baseBudget) / Math.max(1, affixOnly ? Math.max(1, max) : max));
  const pool = [...template.affixPool];
  const affixes: { stat: ItemStat; value: number }[] = [];
  for (let i = 0; i < count; i++) {
    const [stat] = pool.splice(rng.nextInt(pool.length), 1) as [ItemStat];
    const roll = rng.nextRange(rules.affixRollMinPermille, 1000);
    affixes.push({
      stat,
      value: Math.max(1, Math.floor((share * roll) / 1000 / rules.statCost[stat])),
    });
  }

  return {
    templateId: template.id,
    category: template.category,
    itemLevel: input.itemLevel,
    rarity: input.rarity,
    budget,
    base,
    affixes,
  };
}

/** Plätze, in die eine Kategorie passt. */
export function slotsFor(category: ItemCategory): readonly EquipSlot[] {
  switch (category) {
    case 'weapon_1h':
      return ['main_hand', 'off_hand'];
    case 'weapon_2h':
      return ['main_hand'];
    case 'shield':
      return ['off_hand'];
    case 'implant':
      return ['implant_1', 'implant_2'];
    default:
      return [category];
  }
}

export type Equipment = Partial<Record<EquipSlot, ItemData>>;

/** Prüft, ob jedes Item in seinem Platz erlaubt ist (Zweihänder blockiert die Nebenhand). */
export function validateEquipment(equipment: Equipment): void {
  for (const [slot, item] of Object.entries(equipment) as [EquipSlot, ItemData][]) {
    if (!slotsFor(item.category).includes(slot)) {
      throw new ItemError('wrong_slot', `${item.templateId} passt nicht in ${slot}`);
    }
  }
  if (equipment.main_hand?.category === 'weapon_2h' && equipment.off_hand) {
    throw new ItemError('two_handed_blocks_off_hand', 'Ein Zweihänder blockiert die Nebenhand');
  }
}

export interface EquipmentBonus {
  attributes: Record<Attribute, number>;
  /** Flache Kampfwerte, die nach der Ableitung addiert werden. */
  stats: Record<
    | 'maxHp'
    | 'armor'
    | 'firewall'
    | 'accuracy'
    | 'evasion'
    | 'critChance'
    | 'initiative'
    | 'energyRegen',
    number
  >;
  modifiers: Modifiers;
  /** Angriff aus der Haupthand-Waffe; null = Startwaffe der Klasse. */
  attack: { kind: 'physical' | 'tech'; base: number; scalesWith: Attribute; scaling: Fixed } | null;
}

/** Summiert Basiswerte und Affixe aller ausgerüsteten Items. */
export function equipmentBonus(config: GameConfig, equipment: Equipment): EquipmentBonus {
  validateEquipment(equipment);
  const bonus: EquipmentBonus = {
    attributes: { str: 0, dex: 0, int: 0, con: 0 },
    stats: {
      maxHp: 0,
      armor: 0,
      firewall: 0,
      accuracy: 0,
      evasion: 0,
      critChance: 0,
      initiative: 0,
      energyRegen: 0,
    },
    modifiers: {},
    attack: null,
  };
  let damageDealt = 0;
  const add = (stat: ItemStat, value: number) => {
    if (stat === 'str' || stat === 'dex' || stat === 'int' || stat === 'con')
      bonus.attributes[stat] += value;
    else if (stat === 'damageDealt')
      damageDealt += value * 10; // 0,1 % je Punkt
    else bonus.stats[stat] += value;
  };
  for (const raw of Object.values(equipment)) {
    const item = effectiveItem(config, raw);
    for (const [stat, value] of Object.entries(item.base) as [
      ItemStat | 'weaponDamage',
      number,
    ][]) {
      if (stat !== 'weaponDamage') add(stat, value);
    }
    for (const affix of item.affixes) add(affix.stat, affix.value);
  }
  if (damageDealt !== 0) bonus.modifiers = { damageDealt };

  const main = equipment.main_hand && effectiveItem(config, equipment.main_hand);
  if (main) {
    const weapon = findTemplate(config, main.templateId).weapon;
    if (weapon) {
      const off = equipment.off_hand && effectiveItem(config, equipment.off_hand);
      const offDamage =
        off?.category === 'weapon_1h'
          ? roundDiv((off.base.weaponDamage ?? 0) * config.items.offHandDamagePermille, 1000)
          : 0;
      bonus.attack = { ...weapon, base: (main.base.weaponDamage ?? 0) + offDamage };
    }
  }
  return bonus;
}

export interface TemplatePreview {
  budget: number;
  /** Basiswerte (fest, ohne Zufall). */
  base: Partial<Record<ItemStat | 'weaponDamage', number>>;
  affixCount: readonly [number, number];
  /** Wertebereich je möglichem Affix (70–100 % des Anteils). */
  affixRanges: { stat: ItemStat; min: number; max: number }[];
}

/**
 * Vorschau einer Vorlage für den Item-Editor: Budget, feste Basiswerte und die möglichen
 * Affix-Bereiche bei gegebenem Item-Level und Rarität – dieselbe Rechnung wie rollItem.
 */
export function templatePreview(
  config: GameConfig,
  template: ItemTemplate,
  itemLevel: number,
  rarity: number,
): TemplatePreview {
  const rules = config.items;
  const budget = roundDiv(
    rules.categoryBudget[template.category] * itemLevel * rarityFactor(rarity),
    10_000,
  );
  const baseBudget = roundDiv(budget * rules.baseSharePermille[template.category], 1000);
  const weights = Object.entries(template.base) as [ItemStat | 'weaponDamage', number][];
  const totalWeight = weights.reduce((sum, [, w]) => sum + w, 0);
  const base: Partial<Record<ItemStat | 'weaponDamage', number>> = {};
  for (const [stat, weight] of weights) {
    const share = totalWeight > 0 ? Math.floor((baseBudget * weight) / totalWeight) : 0;
    const value = Math.floor(share / rules.statCost[stat]);
    base[stat] = stat === 'weaponDamage' ? rules.weaponDamageFloor + value : value;
  }
  const tier = rarityTier(rarity);
  const [min, max] = rules.affixCount[Math.min(tier, rules.affixCount.length) - 1]!;
  const affixOnly = rules.baseSharePermille[template.category] === 0;
  const share = Math.floor((budget - baseBudget) / Math.max(1, max));
  const cap = template.affixPool.length;
  return {
    budget,
    base,
    affixCount: [
      Math.min(cap, Math.max(affixOnly ? 1 : 0, min)),
      Math.min(cap, Math.max(affixOnly ? 1 : 0, max)),
    ],
    affixRanges: template.affixPool.map((stat) => ({
      stat,
      min: Math.max(
        1,
        Math.floor((share * rules.affixRollMinPermille) / 1000 / rules.statCost[stat]),
      ),
      max: Math.max(1, Math.floor(share / rules.statCost[stat])),
    })),
  };
}
