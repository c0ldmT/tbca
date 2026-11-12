import type { BattleInput, CharacterBuild, ClassId, CombatantSnapshot } from '../src/index.js';
import {
  DEFAULT_GAME_CONFIG,
  defaultLoadout,
  deriveSnapshot,
  ENGINE_VERSION,
} from '../src/index.js';

const config = DEFAULT_GAME_CONFIG;

/** Charakter einer Klasse mit gleichmäßig auf das Hauptattribut und KON verteilten Punkten. */
export function hero(
  id: string,
  classId: ClassId,
  level = 10,
  overrides: Partial<Pick<CharacterBuild, 'loadout'>> = {},
): CombatantSnapshot {
  const points = config.pointsPerLevel * level;
  const primary = config.classes[classId].primary;
  const allocated = { str: 0, dex: 0, int: 0, con: 0 };
  allocated[primary] += Math.ceil(points * 0.6);
  allocated.con += points - Math.ceil(points * 0.6);
  return deriveSnapshot(config, {
    id,
    name: id.toUpperCase(),
    level,
    classId,
    allocated,
    loadout: overrides.loadout ?? defaultLoadout(config, classId, level),
  });
}

/** Ändert einzelne Werte einer Momentaufnahme (für gezielte Regeltests). */
export function tweak(
  s: CombatantSnapshot,
  patch: Partial<Omit<CombatantSnapshot, 'stats'>> & {
    stats?: Partial<CombatantSnapshot['stats']>;
  },
): CombatantSnapshot {
  return { ...s, ...patch, stats: { ...s.stats, ...patch.stats } };
}

export function input(
  teams: CombatantSnapshot[][],
  seed: BattleInput['seed'] = 'seed',
): BattleInput {
  return { engineVersion: ENGINE_VERSION, configVersion: 1, seed, teams };
}

export function duel(seed: BattleInput['seed'] = 'duel'): BattleInput {
  return input([[hero('bruiser', 'bruiser')], [hero('gunner', 'gunner')]], seed);
}

export function teamFight(seed: BattleInput['seed'] = 'team'): BattleInput {
  return input(
    [
      [hero('a-tank', 'bruiser'), hero('a-runner', 'netrunner'), hero('a-medic', 'medtech')],
      [hero('b-gunner', 'gunner'), hero('b-runner', 'netrunner'), hero('b-medic', 'medtech')],
    ],
    seed,
  );
}

/** Friert ein Objekt rekursiv ein, um Mutationen der Eingabe aufzudecken. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}
