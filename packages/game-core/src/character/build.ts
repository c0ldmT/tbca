import type { CombatantSnapshot } from '../battle/types.js';
import type {
  AbilityDef,
  Attribute,
  Attributes,
  ClassId,
  GameConfig,
  StatFormula,
  TacticRule,
} from '../content/types.js';
import { ATTRIBUTES } from '../content/types.js';
import { equipmentBonus, type Equipment } from '../items/items.js';
import { clamp, roundDiv } from '../math/fixed.js';

/** Was ein Spieler an seinem Charakter festlegt; alles andere wird abgeleitet. */
export interface CharacterBuild {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly classId: ClassId;
  /** Frei verteilte Attributspunkte. */
  readonly allocated: Attributes;
  readonly loadout: {
    /** IDs der aktiven Fähigkeiten (höchstens maxActiveAbilities). */
    readonly abilities: readonly string[];
    readonly tactics: readonly TacticRule[];
  };
  /** Ausgerüstete Items; fehlt die Haupthand-Waffe, kämpft die Klasse mit ihrer Startwaffe. */
  readonly equipment?: Equipment;
}

export class BuildError extends Error {
  override readonly name = 'BuildError';
  constructor(
    /** Maschinenlesbarer Grund für API und Übersetzungen. */
    readonly code:
      | 'invalid_level'
      | 'too_many_points'
      | 'negative_points'
      | 'unknown_ability'
      | 'ability_locked'
      | 'too_many_abilities'
      | 'duplicate_ability'
      | 'too_many_rules'
      | 'rule_not_in_loadout',
    message: string,
  ) {
    super(message);
  }
}

/** Freie Attributspunkte, die ein Charakter auf diesem Level insgesamt verteilen darf. */
export function pointsForLevel(config: GameConfig, level: number): number {
  return config.pointsPerLevel * level;
}

/** Noch nicht verteilte Punkte. */
export function unspentPoints(config: GameConfig, level: number, allocated: Attributes): number {
  return pointsForLevel(config, level) - sumAttributes(allocated);
}

/** Kosten des Umskillens in Credits. */
export function respecCost(config: GameConfig, level: number): number {
  return config.respecCostPerLevel * level;
}

/** Gesamtattribute: Basis + fester Klassen-Zuwachs je Level + freie Punkte. */
export function totalAttributes(
  config: GameConfig,
  build: Pick<CharacterBuild, 'level' | 'classId' | 'allocated'>,
): Attributes {
  const growth = config.classes[build.classId].growth;
  const result = {} as Record<Attribute, number>;
  for (const a of ATTRIBUTES) {
    result[a] = config.baseAttributes[a] + growth[a] * (build.level - 1) + build.allocated[a];
  }
  return result;
}

/** Fähigkeiten der Klasse, die auf diesem Level freigeschaltet sind. */
export function availableAbilities(
  config: GameConfig,
  classId: ClassId,
  level: number,
): AbilityDef[] {
  return config.abilities.filter((a) => a.classId === classId && a.unlockLevel <= level);
}

/** Standard-Loadout: die ersten freigeschalteten Fähigkeiten und die Klassen-Taktik. */
export function defaultLoadout(
  config: GameConfig,
  classId: ClassId,
  level: number,
): CharacterBuild['loadout'] {
  const abilities = availableAbilities(config, classId, level)
    .slice(0, config.maxActiveAbilities)
    .map((a) => a.id);
  const tactics = config.classes[classId].defaultTactics.filter((r) => abilities.includes(r.use));
  return { abilities, tactics };
}

/** Prüft Level, Punkte und Loadout; wirft BuildError mit Grund. */
export function validateBuild(config: GameConfig, build: CharacterBuild): void {
  if (!Number.isSafeInteger(build.level) || build.level < 1 || build.level > config.maxLevel) {
    throw new BuildError(
      'invalid_level',
      `Level ${build.level} liegt nicht in 1–${config.maxLevel}`,
    );
  }
  for (const a of ATTRIBUTES) {
    const v = build.allocated[a];
    if (!Number.isSafeInteger(v) || v < 0) {
      throw new BuildError('negative_points', `${a} muss eine nicht-negative ganze Zahl sein`);
    }
  }
  if (unspentPoints(config, build.level, build.allocated) < 0) {
    throw new BuildError(
      'too_many_points',
      `Höchstens ${pointsForLevel(config, build.level)} Punkte auf Level ${build.level}`,
    );
  }

  const { abilities, tactics } = build.loadout;
  if (abilities.length > config.maxActiveAbilities) {
    throw new BuildError(
      'too_many_abilities',
      `Höchstens ${config.maxActiveAbilities} aktive Fähigkeiten`,
    );
  }
  if (new Set(abilities).size !== abilities.length) {
    throw new BuildError('duplicate_ability', 'Eine Fähigkeit ist doppelt im Loadout');
  }
  for (const id of abilities) {
    const def = config.abilities.find((a) => a.id === id);
    if (!def || def.classId !== build.classId) {
      throw new BuildError('unknown_ability', `${id} gehört nicht zur Klasse ${build.classId}`);
    }
    if (def.unlockLevel > build.level) {
      throw new BuildError(
        'ability_locked',
        `${id} ist erst ab Level ${def.unlockLevel} verfügbar`,
      );
    }
  }
  if (tactics.length > config.maxTacticRules) {
    throw new BuildError('too_many_rules', `Höchstens ${config.maxTacticRules} Taktikregeln`);
  }
  for (const rule of tactics) {
    if (rule.use !== 'basic_attack' && !abilities.includes(rule.use)) {
      throw new BuildError(
        'rule_not_in_loadout',
        `Regel nutzt ${rule.use}, das nicht im Loadout ist`,
      );
    }
  }
}

/** Wertet eine Stat-Formel aus (ganzzahlig, gerundet). */
export function evalStat(f: StatFormula, level: number, attrs: Attributes): number {
  let hundredths = (f.base + (f.perLevel ?? 0) * level) * 100;
  for (const a of ATTRIBUTES) hundredths += (f.per?.[a] ?? 0) * attrs[a];
  const value = roundDiv(hundredths, 100);
  return f.max === undefined ? Math.max(0, value) : clamp(value, 0, f.max);
}

/**
 * Leitet die Kampf-Momentaufnahme aus einem Charakter ab. Ausrüstung kommt mit den Items
 * dazu; bis dahin kämpft jede Klasse mit ihrer Startwaffe.
 */
export function deriveSnapshot(config: GameConfig, build: CharacterBuild): CombatantSnapshot {
  validateBuild(config, build);
  const cls = config.classes[build.classId];
  const gear = equipmentBonus(config, build.equipment ?? {});
  const own = totalAttributes(config, build);
  const attributes = {
    str: own.str + gear.attributes.str,
    dex: own.dex + gear.attributes.dex,
    int: own.int + gear.attributes.int,
    con: own.con + gear.attributes.con,
  };
  const stat = (f: StatFormula) => evalStat(f, build.level, attributes);
  const energyMax = stat(config.stats.energyMax);
  const abilityDefs = build.loadout.abilities.map((id) =>
    config.abilities.find((a) => a.id === id)!,
  );
  const weapon = gear.attack ?? cls.starterWeapon;
  const passive = cls.passive.modifiers;
  const gearDamage = gear.modifiers.damageDealt ?? 0;

  return {
    id: build.id,
    name: build.name,
    level: build.level,
    classId: cls.id,
    role: cls.role,
    affinity: cls.affinity,
    attributes,
    stats: {
      maxHp: Math.max(1, stat(config.stats.maxHp) + gear.stats.maxHp),
      armor: stat(config.stats.armor) + gear.stats.armor,
      firewall: stat(config.stats.firewall) + gear.stats.firewall,
      initiative: Math.max(1, stat(config.stats.initiative) + gear.stats.initiative),
      accuracy: stat(config.stats.accuracy) + gear.stats.accuracy,
      evasion: stat(config.stats.evasion) + gear.stats.evasion,
      critChance: clamp(stat(config.stats.critChance) + gear.stats.critChance, 0, 1000),
      critDamage: Math.max(10_000, stat(config.stats.critDamage)),
      threat: cls.threat,
      energyMax,
      energyStart: roundDiv(energyMax * config.energyStartPermille, 1000),
      energyRegen: stat(config.stats.energyRegen) + gear.stats.energyRegen,
    },
    attack: {
      kind: weapon.kind,
      base: 'base' in weapon ? weapon.base : 0,
      attribute: attributes[weapon.scalesWith],
      scaling: weapon.scaling,
    },
    modifiers:
      gearDamage === 0
        ? passive
        : { ...passive, damageDealt: (passive.damageDealt ?? 0) + gearDamage },
    abilities: abilityDefs,
    tactics: build.loadout.tactics,
  };
}

function sumAttributes(a: Attributes): number {
  return ATTRIBUTES.reduce((sum, key) => sum + a[key], 0);
}
