import type { BattleInput, CombatantSnapshot } from '../src/index.js';
import { ENGINE_VERSION } from '../src/index.js';

type Overrides = {
  id: string;
  level?: number;
  stats?: Partial<CombatantSnapshot['stats']>;
  attack?: Partial<CombatantSnapshot['attack']>;
};

/** Ausgeglichener Standard-Kämpfer; einzelne Werte lassen sich überschreiben. */
export function fighter({ id, level = 10, stats = {}, attack = {} }: Overrides): CombatantSnapshot {
  return {
    id,
    name: id.toUpperCase(),
    level,
    stats: {
      maxHp: 400,
      armor: 120,
      firewall: 80,
      initiative: 100,
      accuracy: 60,
      evasion: 40,
      critChance: 100,
      critDamage: 15_000,
      ...stats,
    },
    attack: { kind: 'physical', base: 30, attribute: 40, scaling: 5_000, ...attack },
  };
}

export function duel(seed: BattleInput['seed'] = 'duel'): BattleInput {
  return {
    engineVersion: ENGINE_VERSION,
    configVersion: 1,
    seed,
    teams: [
      [fighter({ id: 'bruiser', stats: { maxHp: 520, armor: 160 } })],
      [
        fighter({
          id: 'gunner',
          stats: { initiative: 130, critChance: 220 },
          attack: { kind: 'physical', base: 26, attribute: 48 },
        }),
      ],
    ],
  };
}

export function teamFight(seed: BattleInput['seed'] = 'team'): BattleInput {
  return {
    engineVersion: ENGINE_VERSION,
    configVersion: 1,
    seed,
    teams: [
      [
        fighter({ id: 'a-tank', stats: { maxHp: 700, armor: 220, threat: 300 } }),
        fighter({ id: 'a-runner', attack: { kind: 'tech', base: 22, attribute: 55 } }),
      ],
      [
        fighter({ id: 'b-gunner', stats: { initiative: 140 } }),
        fighter({ id: 'b-medic', stats: { maxHp: 350, firewall: 150 } }),
      ],
    ],
  };
}

/** Friert ein Objekt rekursiv ein, um Mutationen der Eingabe aufzudecken. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}
