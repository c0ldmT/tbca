import { DEFAULT_GAME_CONFIG } from '../content/default-config.js';
import type { GameConfig } from '../content/types.js';
import { ITEM_NAME_LOCALES, type ItemNameLocale } from './types.js';

/**
 * Anzeigename einer Item-Vorlage je Sprache, für Oberflächen ohne eigene Übersetzungen (z. B. den
 * Discord-Bot). Reihenfolge: Name der Vorlage in der Konfiguration, die andere Sprache, der Name
 * der Startwerte (für ältere Versionen ohne Namen), zuletzt die lesbar gemachte ID.
 */
export function itemNames(
  config: GameConfig,
  templateId: string,
): Readonly<Record<ItemNameLocale, string>> {
  const own = config.items.templates.find((t) => t.id === templateId)?.names ?? {};
  const fallback =
    DEFAULT_GAME_CONFIG.items.templates.find((t) => t.id === templateId)?.names ?? {};
  const readable = readableId(templateId);
  const pick = (locale: ItemNameLocale) =>
    own[locale] ??
    ITEM_NAME_LOCALES.map((l) => own[l]).find(Boolean) ??
    fallback[locale] ??
    readable;
  return Object.fromEntries(ITEM_NAME_LOCALES.map((l) => [l, pick(l)])) as Record<
    ItemNameLocale,
    string
  >;
}

/** „core_implant“ → „Core implant“. */
export function readableId(id: string): string {
  const base = id.replace(/[_-]+/g, ' ').trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}
