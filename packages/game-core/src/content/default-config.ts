import type { AbilityDef, ClassDef, GameConfig } from './types.js';

/**
 * Startwerte der Spielkonfiguration (Spezifikation, Abschnitte 5–6). Werden per Simulation
 * kalibriert und pro Season versioniert in `config_version.data` gespeichert.
 *
 * Grob vorkalibriert mit je 300 Duellen pro Klassenpaar auf Level 10 (Spiegelkämpfe ≈ 50 %);
 * das Attributs-Dreieck wirkt deutlich, die Feinabstimmung folgt mit dem Simulations-Tool.
 */

const classes: Record<ClassDef['id'], ClassDef> = {
  bruiser: {
    id: 'bruiser',
    primary: 'str',
    affinity: 'str',
    role: 'tank',
    growth: { str: 2, dex: 0, int: 0, con: 1 },
    passive: { id: 'bruiser.plating', modifiers: { damageTaken: -1_000 } },
    starterWeapon: { id: 'blade', kind: 'physical', base: 18, scalesWith: 'str', scaling: 9_000 },
    threat: 150,
    defaultTactics: [
      { when: { type: 'self_hp_below', permille: 600 }, use: 'bruiser.fortify', target: 'self' },
      {
        when: { type: 'target_lacks_status', status: 'taunt' },
        use: 'bruiser.provoke',
        target: 'self',
      },
      { when: { type: 'always' }, use: 'bruiser.heavy_strike' },
    ],
  },
  gunner: {
    id: 'gunner',
    primary: 'dex',
    affinity: 'dex',
    role: 'damage',
    growth: { str: 0, dex: 2, int: 0, con: 1 },
    passive: { id: 'gunner.steady_hand', modifiers: { critChance: 40 } },
    starterWeapon: { id: 'pistol', kind: 'physical', base: 11, scalesWith: 'dex', scaling: 7_500 },
    threat: 100,
    defaultTactics: [
      { when: { type: 'always' }, use: 'gunner.aimed_shot', target: 'lowest_hp' },
      { when: { type: 'always' }, use: 'gunner.double_tap' },
    ],
  },
  netrunner: {
    id: 'netrunner',
    primary: 'int',
    affinity: 'int',
    role: 'damage',
    growth: { str: 0, dex: 0, int: 2, con: 1 },
    passive: { id: 'netrunner.exploit', modifiers: { pierce: 200 } },
    starterWeapon: { id: 'cyberdeck', kind: 'tech', base: 16, scalesWith: 'int', scaling: 9_000 },
    threat: 100,
    defaultTactics: [
      { when: { type: 'target_lacks_status', status: 'stun' }, use: 'netrunner.short_circuit' },
      { when: { type: 'always' }, use: 'netrunner.breach' },
    ],
  },
  medtech: {
    id: 'medtech',
    primary: 'int',
    affinity: null,
    role: 'support',
    growth: { str: 0, dex: 0, int: 2, con: 1 },
    passive: { id: 'medtech.triage', modifiers: { healing: 2_000 } },
    starterWeapon: { id: 'injector', kind: 'tech', base: 12, scalesWith: 'int', scaling: 8_000 },
    threat: 90,
    defaultTactics: [
      {
        when: { type: 'ally_hp_below', permille: 600 },
        use: 'medtech.patch_up',
        target: 'lowest_hp_ally',
      },
      {
        when: { type: 'target_lacks_status', status: 'shield' },
        use: 'medtech.barrier',
        target: 'lowest_hp_ally',
      },
    ],
  },
};

const abilities: AbilityDef[] = [
  // Bruiser
  {
    id: 'bruiser.heavy_strike',
    classId: 'bruiser',
    target: 'enemy',
    energyCost: 30,
    cooldown: 2,
    unlockLevel: 1,
    effects: [{ type: 'damage', multiplier: 18_000 }],
  },
  {
    id: 'bruiser.provoke',
    classId: 'bruiser',
    target: 'self',
    energyCost: 20,
    cooldown: 4,
    unlockLevel: 1,
    effects: [
      { type: 'taunt', threat: 300, turns: 3 },
      { type: 'modifier', status: 'buff', modifiers: { damageTaken: -2_000 }, turns: 2 },
    ],
  },
  {
    id: 'bruiser.fortify',
    classId: 'bruiser',
    target: 'self',
    energyCost: 25,
    cooldown: 5,
    unlockLevel: 5,
    effects: [
      {
        type: 'shield',
        amount: { base: 20, scalesWith: 'con', scaling: 15_000 },
        multiplier: 10_000,
        turns: 3,
      },
    ],
  },
  {
    id: 'bruiser.shockwave',
    classId: 'bruiser',
    target: 'all_enemies',
    energyCost: 45,
    cooldown: 4,
    unlockLevel: 10,
    effects: [
      { type: 'damage', multiplier: 8_000 },
      { type: 'stun', turns: 1, chance: 300 },
    ],
  },
  // Gunner
  {
    id: 'gunner.double_tap',
    classId: 'gunner',
    target: 'enemy',
    energyCost: 25,
    cooldown: 1,
    unlockLevel: 1,
    effects: [{ type: 'damage', multiplier: 7_000, hits: 2 }],
  },
  {
    id: 'gunner.aimed_shot',
    classId: 'gunner',
    target: 'enemy',
    energyCost: 35,
    cooldown: 3,
    unlockLevel: 1,
    effects: [{ type: 'damage', multiplier: 15_000, critBonus: 200 }],
  },
  {
    id: 'gunner.suppress',
    classId: 'gunner',
    target: 'enemy',
    energyCost: 20,
    cooldown: 3,
    unlockLevel: 5,
    effects: [
      { type: 'damage', multiplier: 5_000 },
      { type: 'modifier', status: 'debuff', modifiers: { damageDealt: -2_000 }, turns: 2 },
    ],
  },
  {
    id: 'gunner.bullet_storm',
    classId: 'gunner',
    target: 'all_enemies',
    energyCost: 50,
    cooldown: 4,
    unlockLevel: 10,
    effects: [{ type: 'damage', multiplier: 6_000, hits: 2 }],
  },
  // Netrunner
  {
    id: 'netrunner.breach',
    classId: 'netrunner',
    target: 'enemy',
    energyCost: 25,
    cooldown: 1,
    unlockLevel: 1,
    effects: [{ type: 'damage', multiplier: 14_000, kind: 'tech', pierce: 300 }],
  },
  {
    id: 'netrunner.short_circuit',
    classId: 'netrunner',
    target: 'enemy',
    energyCost: 35,
    cooldown: 3,
    unlockLevel: 1,
    effects: [
      { type: 'damage', multiplier: 9_000, kind: 'tech' },
      { type: 'stun', turns: 1, chance: 500 },
    ],
  },
  {
    id: 'netrunner.drain',
    classId: 'netrunner',
    target: 'enemy',
    energyCost: 15,
    cooldown: 3,
    unlockLevel: 5,
    effects: [
      { type: 'energy_drain', amount: 30 },
      { type: 'damage', multiplier: 5_000, kind: 'tech' },
    ],
  },
  {
    id: 'netrunner.virus',
    classId: 'netrunner',
    target: 'enemy',
    energyCost: 30,
    cooldown: 4,
    unlockLevel: 10,
    effects: [
      { type: 'dot', multiplier: 4_500, turns: 3, kind: 'tech' },
      { type: 'modifier', status: 'debuff', modifiers: { damageTaken: 1_500 }, turns: 3 },
    ],
  },
  // Medtech
  {
    id: 'medtech.patch_up',
    classId: 'medtech',
    target: 'ally',
    energyCost: 30,
    cooldown: 2,
    unlockLevel: 1,
    effects: [
      {
        type: 'heal',
        amount: { base: 20, scalesWith: 'int', scaling: 16_000 },
        multiplier: 10_000,
      },
    ],
  },
  {
    id: 'medtech.barrier',
    classId: 'medtech',
    target: 'ally',
    energyCost: 30,
    cooldown: 3,
    unlockLevel: 1,
    effects: [
      {
        type: 'shield',
        amount: { base: 20, scalesWith: 'con', scaling: 15_000 },
        multiplier: 10_000,
        turns: 2,
      },
    ],
  },
  {
    id: 'medtech.stim',
    classId: 'medtech',
    target: 'ally',
    energyCost: 25,
    cooldown: 4,
    unlockLevel: 5,
    effects: [
      { type: 'cleanse' },
      { type: 'modifier', status: 'buff', modifiers: { damageDealt: 2_000 }, turns: 2 },
    ],
  },
  {
    id: 'medtech.toxin',
    classId: 'medtech',
    target: 'enemy',
    energyCost: 25,
    cooldown: 3,
    unlockLevel: 10,
    effects: [{ type: 'dot', multiplier: 5_000, turns: 3, kind: 'tech' }],
  },
];

export const DEFAULT_GAME_CONFIG: GameConfig = {
  maxLevel: 100,
  baseAttributes: { str: 5, dex: 5, int: 5, con: 5 },
  pointsPerLevel: 5,
  respecCostPerLevel: 10,
  maxActiveAbilities: 4,
  maxTacticRules: 6,
  xpCurve: { a: 100, b: 25, c: 3 },
  stats: {
    maxHp: { base: 120, perLevel: 12, per: { con: 1_000 } },
    armor: { base: 10, perLevel: 3, per: { str: 120, con: 60 } },
    firewall: { base: 10, perLevel: 3, per: { int: 80, con: 60 } },
    initiative: { base: 90, per: { dex: 40 }, max: 400 },
    accuracy: { base: 50, perLevel: 1, per: { dex: 50 } },
    evasion: { base: 20, perLevel: 1, per: { dex: 25 } },
    critChance: { base: 50, per: { dex: 120 }, max: 600 },
    critDamage: { base: 15_000 },
    energyMax: { base: 100 },
    energyRegen: { base: 20, per: { int: 10 } },
  },
  energyStartPermille: 500,
  triangleBonus: 1_500,
  classes,
  abilities,
  pvp: {
    dailyRewardedFights: 10,
    maxLevelsBelow: 10,
    sameOpponentPermille: [1000, 500],
    underdogPerLevelPermille: 50,
    underdogMaxPermille: 500,
    winXp: { base: 40, perOpponentLevel: 20 },
    lossXpPermille: 250,
  },
};
