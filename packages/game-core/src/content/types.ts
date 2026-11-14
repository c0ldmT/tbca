import type { Fixed } from '../math/fixed.js';

/**
 * Spielinhalte als Daten (Spezifikation, Abschnitt 1: „Spielwerte sind Daten, kein Code“).
 * Alles hier ist JSON-serialisierbar und gehört zur versionierten Season-Konfiguration.
 * Zahlen sind ganzzahlig: Festkomma (×10 000) oder Promille, wo angegeben.
 */

export const ATTRIBUTES = ['str', 'dex', 'int', 'con'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Attributes = Readonly<Record<Attribute, number>>;

export const CLASS_IDS = ['bruiser', 'gunner', 'netrunner', 'medtech'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** Attributs-Dreieck: STR schlägt DEX, DEX schlägt INT, INT schlägt STR; null = neutral. */
export type Affinity = 'str' | 'dex' | 'int' | null;

export type DamageKind = 'physical' | 'tech';

/** Status, die Taktikregeln abfragen können. */
export const STATUS_KINDS = ['stun', 'dot', 'buff', 'debuff', 'shield', 'taunt'] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

/**
 * Dauerhafte oder zeitweise Werte-Änderungen (Festkomma-Deltas bzw. Promille).
 * Beispiel: damageTaken −1 000 = 10 % weniger erlittener Schaden.
 */
export interface Modifiers {
  /** Verursachter Schaden (Festkomma-Delta). */
  readonly damageDealt?: Fixed;
  /** Erlittener Schaden (Festkomma-Delta). */
  readonly damageTaken?: Fixed;
  /** Zusätzliche Crit-Chance in Promille. */
  readonly critChance?: number;
  /** Ignorierter Anteil der Abwehr des Ziels in Promille. */
  readonly pierce?: number;
  /** Heilung (Festkomma-Delta). */
  readonly healing?: Fixed;
}

/** Skalierung eines Effekts: (base + scaling · Attribut) · multiplier. */
export interface Scaling {
  readonly base: number;
  readonly scalesWith: Attribute;
  /** Festkomma-Faktor s. */
  readonly scaling: Fixed;
}

export type Effect =
  | {
      readonly type: 'damage';
      /** Festkomma-Multiplikator M_Skill auf den Waffenschaden. */
      readonly multiplier: Fixed;
      /** Anzahl Treffer, je mit eigenem Treffer- und Crit-Wurf. */
      readonly hits?: number;
      /** Schadensart; ohne Angabe die der Waffe. */
      readonly kind?: DamageKind;
      readonly pierce?: number;
      readonly critBonus?: number;
    }
  | { readonly type: 'heal'; readonly amount: Scaling; readonly multiplier: Fixed }
  | {
      readonly type: 'shield';
      readonly amount: Scaling;
      readonly multiplier: Fixed;
      readonly turns: number;
    }
  | { readonly type: 'stun'; readonly turns: number; readonly chance: number }
  | {
      readonly type: 'dot';
      /** Schaden pro Zug des Ziels, Anteil am Waffenschaden (Festkomma). */
      readonly multiplier: Fixed;
      readonly turns: number;
      readonly kind?: DamageKind;
    }
  | {
      readonly type: 'modifier';
      readonly status: 'buff' | 'debuff';
      readonly modifiers: Modifiers;
      readonly turns: number;
    }
  | { readonly type: 'taunt'; readonly threat: number; readonly turns: number }
  | { readonly type: 'energy_drain'; readonly amount: number }
  | { readonly type: 'cleanse' };

/** Wen eine Fähigkeit trifft. */
export type AbilityTarget = 'enemy' | 'all_enemies' | 'ally' | 'self';

export interface AbilityDef {
  readonly id: string;
  readonly classId: ClassId | null;
  readonly target: AbilityTarget;
  readonly energyCost: number;
  /** Abklingzeit in eigenen Zügen. */
  readonly cooldown: number;
  readonly unlockLevel: number;
  readonly effects: readonly Effect[];
}

export type TargetSelector =
  'threat' | 'lowest_hp' | 'highest_hp' | 'healer' | 'random' | 'self' | 'lowest_hp_ally';

export type TacticCondition =
  | { readonly type: 'always' }
  | { readonly type: 'self_hp_below'; readonly permille: number }
  | { readonly type: 'ally_hp_below'; readonly permille: number }
  | { readonly type: 'energy_at_least'; readonly value: number }
  | { readonly type: 'target_has_status'; readonly status: StatusKind }
  | { readonly type: 'target_lacks_status'; readonly status: StatusKind }
  | { readonly type: 'round_at_least'; readonly round: number }
  | { readonly type: 'enemies_at_least'; readonly count: number };

/** Taktikregel: Bedingung → Aktion → Ziel. Greift keine Regel, folgt ein Basisangriff. */
export interface TacticRule {
  readonly when: TacticCondition;
  /** Fähigkeits-ID aus dem Loadout oder 'basic_attack'. */
  readonly use: string;
  readonly target?: TargetSelector;
}

/** Linearer Stat-Ausdruck: base + perLevel · Level + Σ (Faktor · Attribut) / 100. */
export interface StatFormula {
  readonly base: number;
  readonly perLevel?: number;
  /** Faktoren in Hundertsteln je Attributpunkt. */
  readonly per?: Partial<Record<Attribute, number>>;
  readonly max?: number;
}

export interface WeaponDef {
  readonly id: string;
  readonly kind: DamageKind;
  readonly base: number;
  readonly scalesWith: Attribute;
  readonly scaling: Fixed;
}

export interface ClassDef {
  readonly id: ClassId;
  readonly primary: Attribute;
  readonly affinity: Affinity;
  readonly role: 'tank' | 'damage' | 'support';
  /** Fester Attributszuwachs pro Level (zusätzlich zu den freien Punkten). */
  readonly growth: Attributes;
  /** Passiv der Klasse. */
  readonly passive: { readonly id: string; readonly modifiers: Modifiers };
  /** Startwaffe, bis Items die Waffe stellen. */
  readonly starterWeapon: WeaponDef;
  /** Grundbedrohung für die Zielwahl der Gegner. */
  readonly threat: number;
  /** Standard-Loadout neuer Charaktere. */
  readonly defaultTactics: readonly TacticRule[];
}

/** Belohnungsregeln für PvP-Herausforderungen (Abschnitt 9). */
export interface PvpRules {
  readonly dailyRewardedFights: number;
  /** Gegen Gegner, die mehr als so viele Level darunter liegen, gibt es nichts. */
  readonly maxLevelsBelow: number;
  /** Faktor je bisherigem belohntem Kampf gegen denselben Gegner am Tag (Promille). */
  readonly sameOpponentPermille: readonly number[];
  readonly underdogPerLevelPermille: number;
  readonly underdogMaxPermille: number;
  /** XP für einen Sieg: base + perOpponentLevel · Gegner-Level. */
  readonly winXp: { readonly base: number; readonly perOpponentLevel: number };
  /** Anteil der Sieg-XP bei Niederlage (Promille). */
  readonly lossXpPermille: number;
}

export interface GameConfig {
  readonly maxLevel: number;
  readonly baseAttributes: Attributes;
  readonly pointsPerLevel: number;
  /** Umskillen kostet Level × respecCostPerLevel Credits. */
  readonly respecCostPerLevel: number;
  readonly maxActiveAbilities: number;
  readonly maxTacticRules: number;
  /** XP bis zum nächsten Level: a + b · L + c · L². */
  readonly xpCurve: { readonly a: number; readonly b: number; readonly c: number };
  readonly stats: {
    readonly maxHp: StatFormula;
    readonly armor: StatFormula;
    readonly firewall: StatFormula;
    readonly initiative: StatFormula;
    readonly accuracy: StatFormula;
    readonly evasion: StatFormula;
    readonly critChance: StatFormula;
    readonly critDamage: StatFormula;
    readonly energyMax: StatFormula;
    readonly energyRegen: StatFormula;
  };
  /** Energie zu Kampfbeginn als Anteil des Maximums in Promille. */
  readonly energyStartPermille: number;
  /** Bonus im Attributs-Dreieck (Festkomma-Delta). */
  readonly triangleBonus: Fixed;
  readonly classes: Readonly<Record<ClassId, ClassDef>>;
  readonly abilities: readonly AbilityDef[];
  readonly pvp: PvpRules;
}
