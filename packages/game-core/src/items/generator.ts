import type { Attribute, DamageKind, GameConfig } from '../content/types.js';
import { Xoshiro128ss, type Seed } from '../random/prng.js';
import { REFERENCE_WEAPON_SCALING, templateCurveSummary } from './curve.js';
import type { ItemCategory, ItemStat, ItemTemplate } from './types.js';

/**
 * Item-Generator: entwirft eine neue Vorlage aus einem Stil (z. B. „Bollwerk“ für Rüstung oder
 * „Schütze“ für Waffen) und gleicht sie mit der Balancing-Kurve ab. Basisgewichte und
 * Affix-Pool kommen aus dem Stil mit etwas Zufall; bei Waffen wird die Skalierung so gewählt,
 * dass die Vorlage im Mittel auf der Kurve liegt. Gleicher Seed, gleiche Vorlage.
 */

type Family = 'armor' | 'weapon' | 'implant';
type Name = readonly [de: string, en: string];

interface Style {
  readonly family: Family;
  readonly base: Readonly<Partial<Record<ItemStat | 'weaponDamage', number>>>;
  /** Kandidaten für den Affix-Pool, wichtigste zuerst. */
  readonly pool: readonly ItemStat[];
  readonly weapon?: { readonly kind: DamageKind; readonly scalesWith: Attribute };
  readonly prefixes: readonly Name[];
}

export const ITEM_STYLES = {
  bulwark: {
    family: 'armor',
    base: { armor: 3, maxHp: 2 },
    pool: ['con', 'maxHp', 'armor', 'firewall', 'evasion', 'str'],
    prefixes: [
      ['Bollwerk', 'Bulwark'],
      ['Titan', 'Titan'],
      ['Panzer', 'Ironclad'],
    ],
  },
  firewall: {
    family: 'armor',
    base: { firewall: 3, armor: 1 },
    pool: ['int', 'firewall', 'con', 'maxHp', 'energyRegen', 'initiative'],
    prefixes: [
      ['Firewall', 'Firewall'],
      ['ICE', 'ICE'],
      ['Spiegel', 'Mirror'],
    ],
  },
  agile: {
    family: 'armor',
    base: { evasion: 2, armor: 1, initiative: 1 },
    pool: ['dex', 'evasion', 'initiative', 'accuracy', 'critChance', 'con'],
    prefixes: [
      ['Phantom', 'Phantom'],
      ['Schatten', 'Shadow'],
      ['Neon', 'Neon'],
    ],
  },
  brawler: {
    family: 'weapon',
    base: { weaponDamage: 1 },
    pool: ['str', 'damageDealt', 'critChance', 'accuracy', 'con', 'dex'],
    weapon: { kind: 'physical', scalesWith: 'str' },
    prefixes: [
      ['Brecher', 'Breaker'],
      ['Schrott', 'Scrap'],
      ['Hydraulik', 'Hydraulic'],
    ],
  },
  marksman: {
    family: 'weapon',
    base: { weaponDamage: 1 },
    pool: ['dex', 'critChance', 'accuracy', 'damageDealt', 'initiative', 'str'],
    weapon: { kind: 'physical', scalesWith: 'dex' },
    prefixes: [
      ['Falken', 'Falcon'],
      ['Präzisions', 'Precision'],
      ['Chrom', 'Chrome'],
    ],
  },
  hacker: {
    family: 'weapon',
    base: { weaponDamage: 1 },
    pool: ['int', 'damageDealt', 'critChance', 'accuracy', 'energyRegen', 'dex'],
    weapon: { kind: 'tech', scalesWith: 'int' },
    prefixes: [
      ['Glitch', 'Glitch'],
      ['Daemon', 'Daemon'],
      ['Null', 'Null'],
    ],
  },
  medic: {
    family: 'weapon',
    base: { weaponDamage: 1 },
    pool: ['int', 'con', 'energyRegen', 'damageDealt', 'critChance', 'accuracy'],
    weapon: { kind: 'tech', scalesWith: 'int' },
    prefixes: [
      ['Vital', 'Vital'],
      ['Nano', 'Nano'],
      ['Puls', 'Pulse'],
    ],
  },
  offense: {
    family: 'implant',
    base: {},
    pool: ['str', 'dex', 'int', 'critChance', 'damageDealt', 'accuracy'],
    prefixes: [
      ['Berserker', 'Berserker'],
      ['Overdrive', 'Overdrive'],
    ],
  },
  defense: {
    family: 'implant',
    base: {},
    pool: ['con', 'maxHp', 'armor', 'firewall', 'evasion', 'str'],
    prefixes: [
      ['Wächter', 'Warden'],
      ['Aegis', 'Aegis'],
    ],
  },
  utility: {
    family: 'implant',
    base: {},
    pool: ['initiative', 'energyRegen', 'int', 'dex', 'con', 'accuracy'],
    prefixes: [
      ['Synapsen', 'Synapse'],
      ['Takt', 'Clock'],
    ],
  },
} as const satisfies Record<string, Style>;

export type ItemStyle = keyof typeof ITEM_STYLES;

const NOUNS: Record<ItemCategory, Partial<Record<ItemStyle | 'any', readonly Name[]>>> = {
  head: {
    any: [
      ['Visier', 'Visor'],
      ['Helm', 'Helmet'],
      ['Neuro-Krone', 'Neuro Crown'],
    ],
  },
  torso: {
    any: [
      ['Weste', 'Vest'],
      ['Panzerjacke', 'Armored Jacket'],
      ['Harnisch', 'Harness'],
    ],
  },
  legs: {
    any: [
      ['Hose', 'Pants'],
      ['Beinschienen', 'Greaves'],
    ],
  },
  feet: {
    any: [
      ['Stiefel', 'Boots'],
      ['Läufer', 'Runners'],
    ],
  },
  hands: {
    any: [
      ['Handschuhe', 'Gloves'],
      ['Griffe', 'Grips'],
    ],
  },
  shield: {
    any: [
      ['Schild', 'Shield'],
      ['Barriere', 'Barrier'],
    ],
  },
  weapon_1h: {
    brawler: [
      ['Klinge', 'Blade'],
      ['Schlagstock', 'Baton'],
    ],
    marksman: [
      ['Pistole', 'Pistol'],
      ['Revolver', 'Revolver'],
    ],
    hacker: [
      ['Cyberdeck', 'Cyberdeck'],
      ['Uplink', 'Uplink'],
    ],
    medic: [
      ['Injektor', 'Injector'],
      ['Nanospritze', 'Nano Syringe'],
    ],
  },
  weapon_2h: {
    brawler: [
      ['Hammer', 'Hammer'],
      ['Kettenschwert', 'Chain Sword'],
    ],
    marksman: [
      ['Gewehr', 'Rifle'],
      ['Railgun', 'Railgun'],
    ],
    hacker: [['Quantendeck', 'Quantum Deck']],
    medic: [['Bio-Lanze', 'Bio Lance']],
  },
  implant: {
    any: [
      ['Implantat', 'Implant'],
      ['Chip', 'Chip'],
    ],
  },
  core_implant: {
    any: [
      ['Kern', 'Core'],
      ['Kernimplantat', 'Core Implant'],
    ],
  },
};

const FAMILY: Record<ItemCategory, Family> = {
  head: 'armor',
  torso: 'armor',
  legs: 'armor',
  feet: 'armor',
  hands: 'armor',
  shield: 'armor',
  weapon_1h: 'weapon',
  weapon_2h: 'weapon',
  implant: 'implant',
  core_implant: 'implant',
};

/** Stile, die zu einer Kategorie passen. */
export function stylesFor(category: ItemCategory): ItemStyle[] {
  return (Object.keys(ITEM_STYLES) as ItemStyle[]).filter(
    (s) => ITEM_STYLES[s].family === FAMILY[category],
  );
}

export interface GenerateTemplateInput {
  readonly category: ItemCategory;
  /** Ohne Angabe ein zufälliger passender Stil. */
  readonly style?: ItemStyle;
  readonly seed: Seed;
}

export interface GeneratedTemplate {
  readonly template: ItemTemplate;
  readonly style: ItemStyle;
  /** Mittlerer Kurven-Abgleich in Promille (1000 = auf der Kurve). */
  readonly ratioPermille: number;
}

/** Erzeugt eine Vorlage mit Namen (DE/EN) und eindeutiger ID innerhalb der Konfiguration. */
export function generateTemplate(
  config: GameConfig,
  input: GenerateTemplateInput,
): GeneratedTemplate {
  const rng = Xoshiro128ss.fromSeed(input.seed);
  const options = stylesFor(input.category);
  const style =
    input.style && options.includes(input.style)
      ? input.style
      : options[rng.nextInt(options.length)]!;
  const def: Style = ITEM_STYLES[style];
  const pick = <T>(list: readonly T[]): T => list[rng.nextInt(list.length)]!;

  // Basisgewichte des Stils mit etwas Streuung (±1, mindestens 1)
  const base: Partial<Record<ItemStat | 'weaponDamage', number>> = {};
  for (const [stat, weight] of Object.entries(def.base) as [ItemStat | 'weaponDamage', number][]) {
    base[stat] = stat === 'weaponDamage' ? weight : Math.max(1, weight + rng.nextInt(3) - 1);
  }

  // Affix-Pool: die ersten vier des Stils sicher, dazu ein bis zwei weitere
  const extra = def.pool.slice(4);
  const pool: ItemStat[] = [...def.pool.slice(0, 4)];
  for (const stat of extra) if (rng.chance(1, 2)) pool.push(stat);

  const [deNoun, enNoun] = pick(
    NOUNS[input.category][style] ?? NOUNS[input.category].any ?? [['Item', 'Item']],
  );
  // Kein „Panzer-Panzerjacke“: Präfixe, die schon im Nomen stecken, fallen weg
  const prefixes = def.prefixes.filter(([de]) => !deNoun.toLowerCase().includes(de.toLowerCase()));
  const [dePrefix, enPrefix] = pick(prefixes.length ? prefixes : def.prefixes);
  const names = { de: `${dePrefix}-${deNoun}`, en: `${enPrefix} ${enNoun}` };
  const id = uniqueId(config, slug(names.en));

  let template: ItemTemplate = {
    id,
    names,
    category: input.category,
    base,
    affixPool: pool,
    ...(def.weapon
      ? {
          weapon: {
            kind: def.weapon.kind,
            scalesWith: def.weapon.scalesWith,
            scaling: REFERENCE_WEAPON_SCALING,
          },
        }
      : {}),
  };

  // Waffen: Skalierung in 250er-Schritten so wählen, dass die Vorlage der Kurve am nächsten ist
  if (template.weapon) {
    let best = template;
    let bestGap = Infinity;
    for (let scaling = 7_000; scaling <= 11_000; scaling += 250) {
      const candidate: ItemTemplate = { ...template, weapon: { ...template.weapon, scaling } };
      const gap = Math.abs(templateCurveSummary(config, candidate).ratioPermille - 1000);
      if (gap < bestGap) {
        best = candidate;
        bestGap = gap;
      }
    }
    template = best;
  }

  return { template, style, ratioPermille: templateCurveSummary(config, template).ratioPermille };
}

/** Kleinbuchstaben, Ziffern und Unterstriche – wie die Konfiguration es für IDs verlangt. */
export function slug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  return base.length >= 2 ? base : `item_${base}`;
}

/** Hängt _2, _3 … an, bis die ID in der Konfiguration frei ist. */
export function uniqueId(config: GameConfig, wanted: string): string {
  const taken = new Set(config.items.templates.map((t) => t.id));
  if (!taken.has(wanted)) return wanted;
  for (let i = 2; ; i++) {
    const id = `${wanted.slice(0, 36)}_${i}`;
    if (!taken.has(id)) return id;
  }
}
