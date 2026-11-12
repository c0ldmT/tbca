import type { GameConfig } from '../content/types.js';
import { validateGameConfig } from '../content/validate.js';
import { CURVE_POINTS, templateCurve } from './curve.js';
import {
  ITEM_NAME_LOCALES,
  ITEM_STATS,
  type ItemCategory,
  type ItemRules,
  type ItemStat,
  type ItemTemplate,
} from './types.js';

/**
 * Normiertes Austauschformat für Item-Werte (`tbca-items/v1`): unabhängig davon, wie die
 * Gewichte in der Konfiguration notiert sind, stehen Basisgewichte als Prozent (Summe 100) und
 * die Waffen-Skalierung als Schaden je Attributpunkt (z. B. 0.9) im Export. Dazu der
 * Kurven-Abgleich je Stufe, damit Änderungen außerhalb des Spiels (Tabellenkalkulation,
 * Auswertung) beurteilt werden können. Der Import übernimmt Vorlagen und optional die Regeln
 * in einen Entwurf und prüft das Ergebnis wie jede andere Konfiguration.
 */

export const ITEM_EXCHANGE_FORMAT = 'tbca-items/v1';

export type ItemExchangeRules = Omit<ItemRules, 'templates'>;

export interface ItemExchangeTemplate {
  readonly id: string;
  readonly names?: Readonly<Partial<Record<'de' | 'en', string>>>;
  readonly category: ItemCategory;
  readonly weapon?: {
    readonly kind: 'physical' | 'tech';
    readonly scalesWith: 'str' | 'dex' | 'int' | 'con';
    /** Schaden je Attributpunkt, z. B. 0.9. */
    readonly perPoint: number;
  };
  /** Basisgewichte in Prozent, Summe 100 (leer bei Implantaten). */
  readonly base: Readonly<Partial<Record<ItemStat | 'weaponDamage', number>>>;
  readonly affixPool: readonly ItemStat[];
  /** Nur im Export: Kurven-Abgleich in Promille je Stufe „L<level>★<rarity>“. */
  readonly curve?: Readonly<Record<string, number>>;
}

export interface ItemExchange {
  readonly format: typeof ITEM_EXCHANGE_FORMAT;
  readonly source?: { readonly configVersion?: number; readonly exportedAt?: string };
  readonly rules: ItemExchangeRules;
  readonly templates: readonly ItemExchangeTemplate[];
}

/** Gewichte → ganzzahlige Prozent mit Summe 100 (größte Reste zuerst aufgerundet). */
export function toPercent<K extends string>(weights: Readonly<Partial<Record<K, number>>>) {
  const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total === 0) return {} as Partial<Record<K, number>>;
  const raw = entries.map(([k, w]) => ({ k, exact: (w * 100) / total }));
  const result = raw.map((r) => ({ ...r, value: Math.floor(r.exact) }));
  let missing = 100 - result.reduce((s, r) => s + r.value, 0);
  for (const r of [...result].sort((a, b) => b.exact - b.value - (a.exact - a.value))) {
    if (missing <= 0) break;
    r.value++;
    missing--;
  }
  return Object.fromEntries(result.map((r) => [r.k, r.value])) as Partial<Record<K, number>>;
}

export function exportItems(
  config: GameConfig,
  source: { configVersion?: number; exportedAt?: string } = {},
): ItemExchange {
  const { templates, ...rules } = config.items;
  return {
    format: ITEM_EXCHANGE_FORMAT,
    source,
    rules: JSON.parse(JSON.stringify(rules)) as ItemExchangeRules,
    templates: templates.map((t) => ({
      id: t.id,
      ...(t.names ? { names: { ...t.names } } : {}),
      category: t.category,
      ...(t.weapon
        ? {
            weapon: {
              kind: t.weapon.kind,
              scalesWith: t.weapon.scalesWith,
              perPoint: t.weapon.scaling / 10_000,
            },
          }
        : {}),
      base: toPercent(t.base),
      affixPool: [...t.affixPool],
      curve: Object.fromEntries(
        CURVE_POINTS.map(([level, rarity]) => [
          `L${level}★${rarity}`,
          templateCurve(config, t, level, rarity).ratioPermille,
        ]),
      ),
    })),
  };
}

export interface ItemImportOptions {
  /** replace: Vorlagen-Liste ersetzen; merge: gleiche IDs ersetzen, neue anhängen, Rest bleibt. */
  readonly mode: 'replace' | 'merge';
  /** Budget-Regeln (Kategoriebudgets, Kosten …) ebenfalls übernehmen. */
  readonly withRules: boolean;
}

export interface ItemImportResult {
  /** Neue Konfiguration; nur verwenden, wenn `problems` leer ist. */
  readonly game: GameConfig;
  readonly added: string[];
  readonly changed: string[];
  readonly removed: string[];
  readonly problems: string[];
}

export function importItems(
  config: GameConfig,
  doc: unknown,
  options: ItemImportOptions,
): ItemImportResult {
  const problems: string[] = [];
  const empty = { game: config, added: [], changed: [], removed: [] };
  if (!isRecord(doc) || doc['format'] !== ITEM_EXCHANGE_FORMAT) {
    return { ...empty, problems: [`Format muss „${ITEM_EXCHANGE_FORMAT}“ sein`] };
  }
  if (!Array.isArray(doc['templates'])) {
    return { ...empty, problems: ['templates muss eine Liste sein'] };
  }
  const incoming: ItemTemplate[] = [];
  for (const [i, raw] of (doc['templates'] as unknown[]).entries()) {
    const parsed = parseTemplate(raw, `Vorlage ${i + 1}`, problems);
    if (parsed) incoming.push(parsed);
  }
  if (problems.length) return { ...empty, problems };

  const before = new Map(config.items.templates.map((t) => [t.id, t]));
  // Unveränderte Vorlagen behalten ihre ursprüngliche Schreibweise (keine Prozent-Umrechnung)
  const kept = incoming.map((t) => {
    const old = before.get(t.id);
    return old && sameTemplate(old, t) ? old : t;
  });
  const byId = new Map(kept.map((t) => [t.id, t]));
  const templates =
    options.mode === 'replace'
      ? kept
      : [
          ...config.items.templates.map((t) => byId.get(t.id) ?? t),
          ...kept.filter((t) => !before.has(t.id)),
        ];
  const rules =
    options.withRules && isRecord(doc['rules'])
      ? ({ ...config.items, ...(doc['rules'] as object) } as ItemRules)
      : config.items;
  const game: GameConfig = { ...config, items: { ...rules, templates } };

  const added = incoming.filter((t) => !before.has(t.id)).map((t) => t.id);
  const changed = incoming
    .filter((t) => before.has(t.id) && !sameTemplate(before.get(t.id)!, t))
    .map((t) => t.id);
  const removed =
    options.mode === 'replace'
      ? config.items.templates.filter((t) => !byId.has(t.id)).map((t) => t.id)
      : [];
  return { game, added, changed, removed, problems: validateGameConfig(game) };
}

function parseTemplate(raw: unknown, label: string, problems: string[]): ItemTemplate | null {
  if (!isRecord(raw)) {
    problems.push(`${label}: kein Objekt`);
    return null;
  }
  const id = typeof raw['id'] === 'string' ? raw['id'] : '';
  const p = `${label} (${id || 'ohne ID'})`;
  const base: Partial<Record<ItemStat | 'weaponDamage', number>> = {};
  if (isRecord(raw['base'])) {
    for (const [stat, value] of Object.entries(raw['base'])) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        problems.push(`${p}: Basisgewicht ${stat} muss eine Zahl ≥ 0 sein`);
        continue;
      }
      if (Math.round(value) > 0) base[stat as ItemStat] = Math.round(value);
    }
  }
  const pool = Array.isArray(raw['affixPool'])
    ? (raw['affixPool'] as unknown[]).filter((s): s is ItemStat =>
        (ITEM_STATS as readonly unknown[]).includes(s),
      )
    : [];
  let weapon: ItemTemplate['weapon'];
  if (isRecord(raw['weapon'])) {
    const w = raw['weapon'];
    const perPoint = w['perPoint'];
    if (typeof perPoint !== 'number' || !Number.isFinite(perPoint) || perPoint < 0) {
      problems.push(`${p}: weapon.perPoint muss eine Zahl ≥ 0 sein`);
    } else {
      weapon = {
        kind: w['kind'] as 'physical' | 'tech',
        scalesWith: w['scalesWith'] as 'str' | 'dex' | 'int' | 'con',
        scaling: Math.round(perPoint * 10_000),
      };
    }
  }
  const names = isRecord(raw['names'])
    ? Object.fromEntries(
        Object.entries(raw['names']).filter(
          ([locale, name]) =>
            (ITEM_NAME_LOCALES as readonly string[]).includes(locale) && typeof name === 'string',
        ),
      )
    : undefined;
  return {
    id,
    ...(names && Object.keys(names).length ? { names } : {}),
    category: raw['category'] as ItemCategory,
    ...(weapon ? { weapon } : {}),
    base,
    affixPool: pool,
  };
}

/** Gleiche Werte bei gleichen Verhältnissen der Gewichte (Prozent-Export ist verlustarm). */
function sameTemplate(a: ItemTemplate, b: ItemTemplate): boolean {
  return (
    a.category === b.category &&
    JSON.stringify(a.names ?? {}) === JSON.stringify(b.names ?? {}) &&
    JSON.stringify(a.weapon ?? null) === JSON.stringify(b.weapon ?? null) &&
    JSON.stringify(toPercent(a.base)) === JSON.stringify(toPercent(b.base)) &&
    JSON.stringify([...a.affixPool].sort()) === JSON.stringify([...b.affixPool].sort())
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
