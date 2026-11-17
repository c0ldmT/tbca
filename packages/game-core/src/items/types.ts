import type { Attribute, DamageKind } from '../content/types.js';
import type { Fixed } from '../math/fixed.js';

/** Ausrüstungsplätze am Charakter (Spezifikation, Abschnitt 7). */
export const EQUIP_SLOTS = [
  'head',
  'torso',
  'legs',
  'feet',
  'hands',
  'main_hand',
  'off_hand',
  'implant_1',
  'implant_2',
  'core_implant',
] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

/** Art eines Item-Vorlage; bestimmt, in welche Plätze es passt. */
export type ItemCategory =
  | 'head'
  | 'torso'
  | 'legs'
  | 'feet'
  | 'hands'
  | 'weapon_1h'
  | 'weapon_2h'
  | 'shield'
  | 'implant'
  | 'core_implant';

/** Werte, die Basiswerte und Affixe liefern können. */
export const ITEM_STATS = [
  'str',
  'dex',
  'int',
  'con',
  'maxHp',
  'armor',
  'firewall',
  'accuracy',
  'evasion',
  'critChance',
  'initiative',
  'energyRegen',
  'damageDealt',
] as const;
export type ItemStat = (typeof ITEM_STATS)[number];

export interface ItemTemplate {
  readonly id: string;
  readonly category: ItemCategory;
  /** Waffenwerte; nur bei Waffen. */
  readonly weapon?: {
    readonly kind: DamageKind;
    readonly scalesWith: Attribute;
    readonly scaling: Fixed;
  };
  /**
   * Wie der Basis-Anteil des Budgets verteilt wird, als Gewichte je Wert.
   * Bei Waffen steht 'weaponDamage' für den Grundschaden W.
   */
  readonly base: Readonly<Partial<Record<ItemStat | 'weaponDamage', number>>>;
  /** Affixe, die auf dieser Vorlage erscheinen können. */
  readonly affixPool: readonly ItemStat[];
}

export interface ItemRules {
  /** Budget je Item-Level und Kategorie (B_Slot); Zweihänder haben das Budget zweier Slots. */
  readonly categoryBudget: Readonly<Record<ItemCategory, number>>;
  /** Anteil des Budgets für Basiswerte (Promille); Implantate leben nur von Affixen. */
  readonly baseSharePermille: Readonly<Record<ItemCategory, number>>;
  /** Budgetkosten je Punkt eines Werts (bei damageDealt je 0,1 %). */
  readonly statCost: Readonly<Record<ItemStat | 'weaponDamage', number>>;
  /** Grundschaden jeder Waffe zusätzlich zum Budget. */
  readonly weaponDamageFloor: number;
  /** Affix-Anzahl [min, max] je Tier (Tier = aufgerundet Rarität / 3, ab Tier 4 gleich). */
  readonly affixCount: readonly (readonly [number, number])[];
  /** Untergrenze des gewürfelten Affix-Werts in Promille seines Anteils (Obergrenze 1000). */
  readonly affixRollMinPermille: number;
  /** Anteil des Nebenhand-Waffenschadens, der zum Angriff hinzukommt (Beidhändigkeit). */
  readonly offHandDamagePermille: number;
  readonly templates: readonly ItemTemplate[];
}

/** Ein konkretes Item (gewürfelt), wie es gespeichert und ausgerüstet wird. */
export interface ItemData {
  readonly templateId: string;
  readonly category: ItemCategory;
  readonly itemLevel: number;
  /** Offene Ganzzahl ab 1. */
  readonly rarity: number;
  /** Verbrauchtes Power-Budget (ganzzahlig, gerundet). */
  readonly budget: number;
  readonly base: Readonly<Partial<Record<ItemStat | 'weaponDamage', number>>>;
  readonly affixes: readonly { readonly stat: ItemStat; readonly value: number }[];
  /** Aufwertungsstufe +0 bis +10; jede Stufe gibt +3 % auf alle Werte (Abschnitt 7). */
  readonly upgrade?: number;
}

/** Materialien sind Items in Stapeln, keine zweite Währung (Abschnitt 12). */
export const MATERIALS = ['scrap', 'circuits', 'quantum_cores'] as const;
export type MaterialId = (typeof MATERIALS)[number];

/** Verbrauchsgüter, z. B. für den Dungeon. */
export const CONSUMABLES = ['backup_chip', 'heal_injector'] as const;
export type ConsumableId = (typeof CONSUMABLES)[number];

export type StackId = MaterialId | ConsumableId;

export interface CraftingRules {
  /** Zerlegen: Materialien je Tier-Band; Menge = base + Item-Level / perLevels. */
  readonly salvage: readonly {
    readonly minTier: number;
    readonly material: MaterialId;
    readonly base: number;
    readonly perLevels: number;
  }[];
  readonly upgrade: {
    readonly maxLevel: number;
    /** Wertzuwachs je Stufe in Promille. */
    readonly bonusPerLevelPermille: number;
    /** Erfolgschance je Zielstufe (Index 0 = +1) in Promille; scheitert es, sinkt die Stufe um 1. */
    readonly successPermille: readonly number[];
    readonly credits: {
      readonly base: number;
      readonly perItemLevel: number;
      readonly perUpgrade: number;
    };
    /** Material je Zielstufe (Index 0 = +1) und Menge = 1 + Zielstufe / 2. */
    readonly material: readonly MaterialId[];
  };
  readonly transfer: {
    /** Erfolgschance je Anzahl vorhandener Affixe am Ziel (Promille). */
    readonly successPermille: readonly number[];
    readonly credits: { readonly base: number; readonly perItemLevel: number };
  };
  readonly reroll: {
    readonly credits: { readonly base: number; readonly perItemLevel: number };
    readonly material: MaterialId;
    readonly materialAmount: number;
  };
}

export interface ShopRules {
  readonly consumables: readonly { readonly id: ConsumableId; readonly price: number }[];
  /** Tägliche Rotation: Anzahl Ausrüstungsangebote je Spieler, höchste Rarität. */
  readonly rotationSize: number;
  readonly rotationMaxRarity: number;
  /** Preis eines Items = Budget · priceCreditsPerBudget. */
  readonly priceCreditsPerBudget: number;
  /** Verkauf an den Shop bringt diesen Anteil des Werts (Promille). */
  readonly sellPermille: number;
}
