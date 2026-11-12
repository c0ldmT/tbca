import type { GameConfig } from '../content/types.js';
import { roundDiv } from '../math/fixed.js';
import { itemBudget, rarityTier } from './items.js';
import type { ItemStat, ItemTemplate } from './types.js';

/**
 * Abgleich einer Item-Vorlage mit der Balancing-Kurve (Spezifikation, Abschnitt 7).
 *
 * Jede Vorlage einer Kategorie hat dasselbe Power-Budget. Wie viel davon im Kampf ankommt,
 * hängt aber von der Vorlage ab: ein kleiner Affix-Pool lässt Affix-Plätze leer, eine hohe
 * Waffen-Skalierung legt Schaden oben drauf. Der Abgleich rechnet alles in Budget-Punkte um
 * (Kosten je Wert aus `statCost`) und vergleicht mit einer Referenz-Vorlage derselben
 * Kategorie: voller Affix-Pool, Skalierung 0,9 je Attributpunkt. 1000 ‰ = genau auf der Kurve.
 */

/** Referenz-Skalierung einer Waffe (Festkomma 1/10 000): 0,9 Schaden je Attributpunkt. */
export const REFERENCE_WEAPON_SCALING = 9_000;
/** Punkte, die ein typischer Spieler je Level ins Hauptattribut steckt (Promille der freien). */
const PRIMARY_SHARE_PERMILLE = 600;
/** Fester Klassen-Zuwachs des Hauptattributs je Level. */
const PRIMARY_GROWTH = 2;

export interface TemplateCurve {
  readonly level: number;
  readonly rarity: number;
  readonly budget: number;
  /** Budget-Punkte, die eine Referenz-Vorlage im Mittel trägt. */
  readonly reference: number;
  /** Budget-Punkte dieser Vorlage im Mittel. */
  readonly effective: number;
  /** effective / reference in Promille; 1000 = auf der Kurve. */
  readonly ratioPermille: number;
  readonly parts: {
    readonly base: number;
    readonly affixes: number;
    /** Mehr- oder Minderschaden durch die Waffen-Skalierung, in Budget-Punkten. */
    readonly scaling: number;
  };
}

/** Typischer Wert des Hauptattributs auf einem Level (Bot-Verteilung, ohne Ausrüstung). */
export function typicalPrimary(config: GameConfig, level: number): number {
  const free = config.pointsPerLevel * level;
  return (
    Math.max(...Object.values(config.baseAttributes)) +
    PRIMARY_GROWTH * (level - 1) +
    roundDiv(free * PRIMARY_SHARE_PERMILLE, 1000)
  );
}

export function templateCurve(
  config: GameConfig,
  template: ItemTemplate,
  level: number,
  rarity: number,
): TemplateCurve {
  const rules = config.items;
  const budget = itemBudget(config, template.category, level, rarity);
  const baseBudget = roundDiv(budget * rules.baseSharePermille[template.category], 1000);
  const affixOnly = rules.baseSharePermille[template.category] === 0;

  // Basiswerte: tatsächlich vergebene Punkte (Abrundung je Wert eingerechnet)
  const weights = Object.entries(template.base) as [ItemStat | 'weaponDamage', number][];
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let base = 0;
  for (const [stat, weight] of weights) {
    const share = total > 0 ? Math.floor((baseBudget * weight) / total) : 0;
    base += Math.floor(share / rules.statCost[stat]) * rules.statCost[stat];
  }

  // Affixe: mittlere Anzahl (durch den Pool begrenzt) mal mittlerer Wurf
  const [minCount, maxCount] =
    rules.affixCount[Math.min(rarityTier(rarity), rules.affixCount.length) - 1]!;
  const lo = Math.max(affixOnly ? 1 : 0, minCount);
  const hi = Math.max(affixOnly ? 1 : 0, maxCount);
  const share = Math.floor((budget - baseBudget) / Math.max(1, hi));
  const meanRoll = (share * (rules.affixRollMinPermille + 1000)) / 2000;
  const pool = template.affixPool.length;
  const meanCount = (Math.min(pool, lo) + Math.min(pool, hi)) / 2;
  const affixes = Math.round(meanCount * meanRoll);
  const referenceAffixes = Math.round(((lo + hi) / 2) * meanRoll);

  // Waffen: Schaden über der Referenz-Skalierung zählt wie zusätzlicher Grundschaden
  let scaling = 0;
  if (template.weapon) {
    const attribute = typicalPrimary(config, level);
    const extraDamage = ((template.weapon.scaling - REFERENCE_WEAPON_SCALING) * attribute) / 10_000;
    scaling = Math.round(extraDamage * rules.statCost.weaponDamage);
  }

  const reference = Math.max(1, baseBudget + referenceAffixes);
  const effective = base + affixes + scaling;
  return {
    level,
    rarity,
    budget,
    reference,
    effective,
    ratioPermille: Math.round((effective * 1000) / reference),
    parts: { base, affixes, scaling },
  };
}

/** Abgleich auf mehreren Stufen (früh, mittel, spät), für Übersichten und Exporte. */
export const CURVE_POINTS: readonly (readonly [level: number, rarity: number])[] = [
  [10, 3],
  [30, 6],
  [60, 9],
];

export function templateCurveSummary(config: GameConfig, template: ItemTemplate) {
  const points = CURVE_POINTS.map(([level, rarity]) =>
    templateCurve(config, template, level, rarity),
  );
  const ratios = points.map((p) => p.ratioPermille);
  return {
    points,
    /** Mittel über die Stufen in Promille. */
    ratioPermille: Math.round(ratios.reduce((s, r) => s + r, 0) / ratios.length),
  };
}
