import type { CombatantSnapshot } from '../battle/types.js';
import { botBuild } from '../bots/bot-build.js';
import { deriveSnapshot } from '../character/build.js';
import { CLASS_IDS, type GameConfig } from '../content/types.js';
import { rollLoot } from '../items/loot.js';
import type { ItemData } from '../items/types.js';
import { roundDiv } from '../math/fixed.js';
import { Xoshiro128ss, type Seed } from '../random/prng.js';

/** Regeln des Dungeons (Spezifikation, Abschnitt 8). */
export interface DungeonRules {
  readonly runsPerDay: number;
  /** Eintritt in Credits: base + perLevel · Charakterlevel. */
  readonly fee: { readonly base: number; readonly perLevel: number };
  /** Etage 1 liegt so viele Level unter dem Charakter (mindestens Level 1). */
  readonly levelOffset: number;
  /** HP- und Energie-Regeneration zwischen Etagen (Promille des Maximums). */
  readonly regenPermille: number;
  /** Heil-Injektor heilt diesen Anteil der maximalen HP (Promille). */
  readonly healPermille: number;
  /**
   * Wirksamkeit eigener Heilfähigkeiten im Dungeon (Promille; 1000 = wie im PvP). Der Abzug
   * wirkt additiv zum Heil-Bonus der Klasse.
   */
  readonly healingPermille: number;
  readonly maxInjectors: number;
  readonly bossEvery: number;
  readonly boss: { readonly hpPermille: number; readonly damage: number };
  /** Ab dieser Etage bekommen Monster Modifikatoren. */
  readonly modifiersFrom: number;
  /** Weitere Monster je so vielen Etagen, bis maxMonsters. */
  readonly monstersEvery: number;
  readonly maxMonsters: number;
  readonly xpPerFloor: { readonly base: number; readonly perLevel: number };
  readonly creditsPerFloor: { readonly base: number; readonly perLevel: number };
  /** Höchste Rarität je Tiefe (Stern 10+ erst ab Etage 20 usw.). */
  readonly maxRarityByFloor: readonly { readonly fromFloor: number; readonly maxRarity: number }[];
  /** Nach so vielen Millisekunden ohne Entscheidung verlässt der Charakter den Dungeon mit Loot. */
  readonly decisionTimeoutMs: number;
}

export const DUNGEON_MODIFIERS = ['shielded', 'enraged', 'swift'] as const;
export type DungeonModifier = (typeof DUNGEON_MODIFIERS)[number];

export const MONSTER_NAMES = [
  'drone',
  'ganger',
  'sentinel',
  'hound',
  'glitch',
  'enforcer',
] as const;

export interface FloorPlan {
  readonly floor: number;
  readonly monsterLevel: number;
  readonly boss: boolean;
  readonly modifiers: readonly DungeonModifier[];
  readonly enemies: readonly CombatantSnapshot[];
}

export function monsterLevel(rules: DungeonRules, characterLevel: number, floor: number): number {
  return Math.max(1, characterLevel - rules.levelOffset + floor - 1);
}

export function isBossFloor(rules: DungeonRules, floor: number): boolean {
  return floor % rules.bossEvery === 0;
}

export function dungeonFee(rules: DungeonRules, characterLevel: number): number {
  return rules.fee.base + rules.fee.perLevel * characterLevel;
}

export function maxRarityAt(rules: DungeonRules, floor: number): number {
  let max = 1;
  for (const band of rules.maxRarityByFloor) if (floor >= band.fromFloor) max = band.maxRarity;
  return max;
}

/**
 * Gegner einer Etage: Monster sind computergesteuerte Builds einer zufälligen Klasse auf dem
 * Monster-Level, ab `modifiersFrom` mit Modifikatoren (Schild, Wut, Tempo). Boss-Etagen haben einen
 * einzelnen, deutlich stärkeren Gegner. Gleicher Seed, gleiche Etage.
 */
/** Momentaufnahme des Charakters für einen Dungeon-Run (Heilung nach `healingPermille`). */
export function dungeonFighter(rules: DungeonRules, s: CombatantSnapshot): CombatantSnapshot {
  const permille = rules.healingPermille ?? 1000;
  if (permille === 1000) return s;
  const healing = (s.modifiers.healing ?? 0) + (permille - 1000) * 10;
  return { ...s, modifiers: { ...s.modifiers, healing } };
}

export function planFloor(
  config: GameConfig,
  input: { characterLevel: number; floor: number; seed: Seed },
): FloorPlan {
  const rules = config.dungeon;
  const rng = Xoshiro128ss.fromSeed(input.seed);
  const level = Math.min(config.maxLevel, monsterLevel(rules, input.characterLevel, input.floor));
  const boss = isBossFloor(rules, input.floor);
  const modifiers: DungeonModifier[] = [];
  if (input.floor >= rules.modifiersFrom) {
    const count = 1 + Math.floor((input.floor - rules.modifiersFrom) / 20);
    const pool = [...DUNGEON_MODIFIERS];
    for (let i = 0; i < count && pool.length > 0; i++)
      modifiers.push(pool.splice(rng.nextInt(pool.length), 1)[0]!);
  }
  const count = boss
    ? 1
    : Math.min(rules.maxMonsters, 1 + Math.floor((input.floor - 1) / rules.monstersEvery));

  const enemies = Array.from({ length: count }, (_, i) => {
    const classId = CLASS_IDS[rng.nextInt(CLASS_IDS.length)]!;
    const name = boss ? 'warden' : MONSTER_NAMES[rng.nextInt(MONSTER_NAMES.length)]!;
    const base = deriveSnapshot(
      config,
      botBuild(config, {
        id: `m${input.floor}-${i}`,
        name,
        classId,
        level,
        seed: rng.nextUint32(),
      }),
    );
    return applyMonsterTraits(rules, base, boss, modifiers);
  });
  return { floor: input.floor, monsterLevel: level, boss, modifiers, enemies };
}

function applyMonsterTraits(
  rules: DungeonRules,
  s: CombatantSnapshot,
  boss: boolean,
  modifiers: readonly DungeonModifier[],
): CombatantSnapshot {
  let stats = s.stats;
  let damage = s.modifiers.damageDealt ?? 0;
  if (boss) {
    stats = { ...stats, maxHp: roundDiv(stats.maxHp * rules.boss.hpPermille, 1000) };
    damage += rules.boss.damage;
  }
  if (modifiers.includes('shielded')) {
    stats = {
      ...stats,
      armor: roundDiv(stats.armor * 13, 10),
      firewall: roundDiv(stats.firewall * 13, 10),
    };
  }
  if (modifiers.includes('enraged')) damage += 2_500;
  if (modifiers.includes('swift'))
    stats = { ...stats, initiative: roundDiv(stats.initiative * 5, 4) };
  // Monster gehören keiner Klasse: kein Attributs-Dreieck, keine Rolle als Heiler.
  return {
    ...s,
    classId: null,
    affinity: null,
    stats,
    modifiers: damage === 0 ? s.modifiers : { ...s.modifiers, damageDealt: damage },
  };
}

export interface FloorReward {
  readonly xp: number;
  readonly credits: number;
  readonly items: readonly ItemData[];
}

/** Belohnung einer gewonnenen Etage; Boss-Etagen würfeln doppelt und die Rarität zweimal. */
export function floorReward(
  config: GameConfig,
  input: { plan: FloorPlan; seed: Seed },
): FloorReward {
  const rules = config.dungeon;
  const rng = Xoshiro128ss.fromSeed(input.seed);
  const level = input.plan.monsterLevel;
  const maxRarity = maxRarityAt(rules, input.plan.floor);
  const rolls = input.plan.boss ? 2 : 1;
  const items = Array.from({ length: rolls }, () => {
    const a = rollLoot(config, { itemLevel: level, maxRarity, seed: rng.nextUint32() });
    if (!input.plan.boss) return a;
    const b = rollLoot(config, { itemLevel: level, maxRarity, seed: rng.nextUint32() });
    return b.rarity > a.rarity ? b : a; // garantiert besserer Loot
  });
  const factor = input.plan.boss ? 2 : 1;
  return {
    xp: factor * (rules.xpPerFloor.base + rules.xpPerFloor.perLevel * level),
    credits: factor * (rules.creditsPerFloor.base + rules.creditsPerFloor.perLevel * level),
    items,
  };
}

/** HP und Energie nach einer Etage: +regen % des Maximums, gedeckelt. */
export function regenerate(
  rules: DungeonRules,
  state: { hp: number; energy: number },
  max: { hp: number; energy: number },
): { hp: number; energy: number } {
  return {
    hp: Math.min(max.hp, state.hp + roundDiv(max.hp * rules.regenPermille, 1000)),
    energy: Math.min(max.energy, state.energy + roundDiv(max.energy * rules.regenPermille, 1000)),
  };
}
