import { defaultLoadout, deriveSnapshot } from '../character/build.js';
import { planFloor } from '../dungeon/dungeon.js';
import { rollItem } from '../items/items.js';
import { ITEM_STATS, type ItemCategory } from '../items/types.js';
import { ATTRIBUTES, CLASS_IDS, type GameConfig } from './types.js';

const CATEGORIES: readonly ItemCategory[] = [
  'head',
  'torso',
  'legs',
  'feet',
  'hands',
  'weapon_1h',
  'weapon_2h',
  'shield',
  'implant',
  'core_implant',
];
const EFFECTS = [
  'damage',
  'heal',
  'shield',
  'stun',
  'dot',
  'modifier',
  'taunt',
  'energy_drain',
  'cleanse',
];

const isInt = (v: unknown, min = 0) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;

/**
 * Prüft eine Spielkonfiguration, bevor sie gespeichert oder veröffentlicht wird
 * (Spezifikation, Abschnitt 13). Liefert eine Liste verständlicher Probleme; leer = gültig.
 * Neben Strukturregeln wird die Konfiguration einmal „durchgespielt“: Charaktere ableiten,
 * Items würfeln, Dungeon-Etagen planen.
 */
export function validateGameConfig(config: GameConfig): string[] {
  const problems: string[] = [];
  const add = (p: string) => problems.push(p);

  // Klassen und Fähigkeiten
  const abilityIds = new Set<string>();
  for (const a of config.abilities ?? []) {
    if (abilityIds.has(a.id)) add(`Fähigkeit ${a.id} ist doppelt`);
    abilityIds.add(a.id);
    if (a.classId !== null && !CLASS_IDS.includes(a.classId))
      add(`Fähigkeit ${a.id}: unbekannte Klasse ${a.classId}`);
    if (!isInt(a.energyCost) || !isInt(a.cooldown) || !isInt(a.unlockLevel, 1)) {
      add(`Fähigkeit ${a.id}: Energie, Abklingzeit und Freischalt-Level müssen ganze Zahlen sein`);
    }
    for (const e of a.effects ?? [])
      if (!EFFECTS.includes(e.type)) add(`Fähigkeit ${a.id}: unbekannter Effekt ${e.type}`);
  }
  for (const id of CLASS_IDS) {
    const cls = config.classes?.[id];
    if (!cls) {
      add(`Klasse ${id} fehlt`);
      continue;
    }
    if (!ATTRIBUTES.includes(cls.primary)) add(`Klasse ${id}: unbekanntes Hauptattribut`);
    for (const rule of cls.defaultTactics ?? []) {
      const ability = config.abilities.find((a) => a.id === rule.use);
      if (rule.use !== 'basic_attack' && ability?.classId !== id)
        add(`Klasse ${id}: Standard-Taktik nutzt ${rule.use}`);
    }
  }

  // Items
  const rules = config.items;
  if (!rules) add('Item-Regeln fehlen');
  else {
    for (const c of CATEGORIES) {
      if (!isInt(rules.categoryBudget?.[c], 1))
        add(`Budget der Kategorie ${c} muss eine ganze Zahl ≥ 1 sein`);
      const share = rules.baseSharePermille?.[c];
      if (!isInt(share) || share > 1000)
        add(`Basis-Anteil der Kategorie ${c} muss zwischen 0 und 1000 liegen`);
    }
    for (const s of [...ITEM_STATS, 'weaponDamage'] as const) {
      if (!isInt(rules.statCost?.[s], 1)) add(`Kosten für ${s} müssen eine ganze Zahl ≥ 1 sein`);
    }
    const ids = new Set<string>();
    for (const t of rules.templates ?? []) {
      const p = `Vorlage ${t.id || '(ohne ID)'}`;
      if (!/^[a-z0-9_]{2,40}$/.test(t.id ?? ''))
        add(`${p}: ID nur aus a–z, 0–9 und _ (2–40 Zeichen)`);
      if (ids.has(t.id)) add(`${p}: ID ist doppelt`);
      ids.add(t.id);
      if (!CATEGORIES.includes(t.category)) add(`${p}: unbekannte Kategorie ${t.category}`);
      const isWeapon = t.category === 'weapon_1h' || t.category === 'weapon_2h';
      if (isWeapon !== Boolean(t.weapon))
        add(`${p}: Waffenwerte ${isWeapon ? 'fehlen' : 'nur bei Waffen'}`);
      if (t.weapon && (!ATTRIBUTES.includes(t.weapon.scalesWith) || !isInt(t.weapon.scaling))) {
        add(`${p}: ungültige Waffen-Skalierung`);
      }
      for (const [stat, weight] of Object.entries(t.base ?? {})) {
        if (![...ITEM_STATS, 'weaponDamage'].includes(stat))
          add(`${p}: unbekannter Basiswert ${stat}`);
        if (!isInt(weight)) add(`${p}: Gewicht von ${stat} muss eine ganze Zahl ≥ 0 sein`);
      }
      if (isWeapon && !t.base?.weaponDamage)
        add(`${p}: Waffen brauchen einen Gewichtsanteil für weaponDamage`);
      for (const stat of t.affixPool ?? [])
        if (!ITEM_STATS.includes(stat)) add(`${p}: unbekannter Affix ${stat}`);
      if ((rules.baseSharePermille?.[t.category] ?? 0) === 0 && (t.affixPool ?? []).length === 0) {
        add(`${p}: ohne Basis-Anteil braucht die Vorlage Affixe`);
      }
    }
    if (ids.size === 0) add('Mindestens eine Item-Vorlage ist nötig');
  }

  if (problems.length > 0) return problems;

  // Durchspielen: wirft etwas, ist die Konfiguration nicht nutzbar.
  try {
    for (const classId of CLASS_IDS) {
      for (const level of [1, 50, config.maxLevel]) {
        deriveSnapshot(config, {
          id: 'v',
          name: 'Check',
          level,
          classId,
          allocated: { str: 0, dex: 0, int: 0, con: 0 },
          loadout: defaultLoadout(config, classId, level),
        });
      }
    }
    for (const t of config.items.templates) {
      for (const [level, rarity] of [
        [1, 1],
        [config.maxLevel, 16],
      ] as const) {
        rollItem(config, { templateId: t.id, itemLevel: level, rarity, seed: 'check' });
      }
    }
    for (const floor of [1, 50]) planFloor(config, { characterLevel: 10, floor, seed: 'check' });
  } catch (error) {
    add(`Konfiguration nicht spielbar: ${error instanceof Error ? error.message : String(error)}`);
  }
  return problems;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Ergänzt eine gespeicherte Konfiguration um Felder, die der Code inzwischen kennt, die Version
 * aber noch nicht hat. Objekte werden rekursiv zusammengeführt, Listen (Vorlagen, Fähigkeiten …)
 * gelten wie gespeichert.
 */
export function withDefaults<T>(defaults: T, stored: unknown): T {
  if (!isPlainObject(defaults) || !isPlainObject(stored)) return (stored ?? defaults) as T;
  const out: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(stored)) {
    out[key] =
      key in defaults ? withDefaults((defaults as Record<string, unknown>)[key], value) : value;
  }
  return out as T;
}
