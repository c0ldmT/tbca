import type { ItemRules, ItemStat } from '../items/types.js';
import type { AbilityDef, ClassDef, GameConfig } from './types.js';

/**
 * Startwerte der Spielkonfiguration (Spezifikation, Abschnitte 5–6). Werden per Simulation
 * kalibriert und pro Season versioniert in `config_version.data` gespeichert.
 *
 * Kalibriert mit der Balancing-Simulation (Duelle aller Klassenpaare auf Level 3–80 mit
 * passender Ausrüstung): Gesamtquoten etwa 40–60 %, Dreieck-Paarungen etwa 60–70 % für die
 * überlegene Seite. Vorgehen und Zahlen: docs/balancing.md.
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
      { when: { type: 'enemies_at_least', count: 2 }, use: 'bruiser.shockwave' },
      // Spott lohnt nur mit Verbündeten; im Duell kostet er nur Züge.
      { when: { type: 'enemies_at_least', count: 2 }, use: 'bruiser.provoke', target: 'self' },
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
    starterWeapon: { id: 'pistol', kind: 'physical', base: 14, scalesWith: 'dex', scaling: 8_750 },
    threat: 100,
    defaultTactics: [
      { when: { type: 'enemies_at_least', count: 2 }, use: 'gunner.bullet_storm' },
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
    passive: { id: 'netrunner.exploit', modifiers: { pierce: 250 } },
    starterWeapon: { id: 'cyberdeck', kind: 'tech', base: 16, scalesWith: 'int', scaling: 9_000 },
    threat: 100,
    defaultTactics: [
      { when: { type: 'target_lacks_status', status: 'dot' }, use: 'netrunner.virus' },
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
    starterWeapon: { id: 'injector', kind: 'tech', base: 15, scalesWith: 'int', scaling: 9_000 },
    threat: 90,
    defaultTactics: [
      // Im Team zuerst das Stimulans für alle; im Duell greift die Regel nie
      { when: { type: 'enemies_at_least', count: 2 }, use: 'medtech.stim' },
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
      { when: { type: 'target_lacks_status', status: 'dot' }, use: 'medtech.toxin' },
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
    effects: [{ type: 'damage', multiplier: 22_000 }],
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
        amount: { base: 20, scalesWith: 'con', scaling: 14_000 },
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
    effects: [{ type: 'damage', multiplier: 8_750, hits: 2 }],
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
    effects: [{ type: 'damage', multiplier: 14_000, kind: 'tech', pierce: 250 }],
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
    // Verbreitet sich über alle Gegner; im Duell trifft er wie bisher einen
    target: 'all_enemies',
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
        // Kleiner Grundwert: auf niedrigem Level heilt der Medtech sonst schneller, als Gegner treffen.
        amount: { base: 10, scalesWith: 'int', scaling: 16_000 },
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
    // Team-Fähigkeit: wirkt auf alle Verbündeten, im Duell nur auf den Medtech selbst
    target: 'all_allies',
    energyCost: 25,
    cooldown: 4,
    unlockLevel: 5,
    effects: [
      { type: 'cleanse' },
      { type: 'heal', amount: { base: 15, scalesWith: 'int', scaling: 4_000 }, multiplier: 10_000 },
      { type: 'modifier', status: 'buff', modifiers: { damageDealt: 1_500 }, turns: 2 },
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

const ARMOR_AFFIXES: ItemStat[] = ['con', 'maxHp', 'armor', 'firewall', 'evasion', 'initiative'];
const WEAPON_AFFIXES: ItemStat[] = ['str', 'dex', 'int', 'accuracy', 'critChance', 'damageDealt'];
const IMPLANT_AFFIXES: ItemStat[] = [
  'str',
  'dex',
  'int',
  'con',
  'initiative',
  'critChance',
  'energyRegen',
];

/** Startset an Item-Vorlagen und Budget-Regeln (Abschnitt 7). */
const items: ItemRules = {
  categoryBudget: {
    head: 6,
    torso: 8,
    legs: 6,
    feet: 4,
    hands: 4,
    weapon_1h: 10,
    weapon_2h: 20,
    shield: 6,
    implant: 5,
    core_implant: 7,
  },
  baseSharePermille: {
    head: 600,
    torso: 600,
    legs: 600,
    feet: 600,
    hands: 600,
    weapon_1h: 600,
    weapon_2h: 600,
    shield: 600,
    implant: 0,
    core_implant: 0,
  },
  statCost: {
    str: 4,
    dex: 4,
    int: 4,
    con: 4,
    maxHp: 1,
    armor: 1,
    firewall: 1,
    accuracy: 2,
    evasion: 2,
    critChance: 1,
    initiative: 3,
    energyRegen: 6,
    damageDealt: 2,
    weaponDamage: 4,
  },
  weaponDamageFloor: 12,
  affixCount: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
  ],
  affixRollMinPermille: 700,
  offHandDamagePermille: 500,
  templates: [
    {
      id: 'blade',
      names: { de: 'Klinge', en: 'Blade' },
      category: 'weapon_1h',
      weapon: { kind: 'physical', scalesWith: 'str', scaling: 9_000 },
      base: { weaponDamage: 1 },
      affixPool: WEAPON_AFFIXES,
    },
    {
      id: 'club',
      names: { de: 'Schlagwaffe', en: 'Club' },
      category: 'weapon_1h',
      weapon: { kind: 'physical', scalesWith: 'str', scaling: 9_250 },
      base: { weaponDamage: 1 },
      affixPool: WEAPON_AFFIXES,
    },
    {
      id: 'pistol',
      names: { de: 'Pistole', en: 'Pistol' },
      category: 'weapon_1h',
      weapon: { kind: 'physical', scalesWith: 'dex', scaling: 8_750 },
      base: { weaponDamage: 1 },
      affixPool: WEAPON_AFFIXES,
    },
    {
      id: 'rifle',
      names: { de: 'Gewehr', en: 'Rifle' },
      category: 'weapon_2h',
      weapon: { kind: 'physical', scalesWith: 'dex', scaling: 9_000 },
      base: { weaponDamage: 1 },
      affixPool: WEAPON_AFFIXES,
    },
    {
      id: 'cyberdeck',
      names: { de: 'Cyberdeck', en: 'Cyberdeck' },
      category: 'weapon_1h',
      weapon: { kind: 'tech', scalesWith: 'int', scaling: 9_000 },
      base: { weaponDamage: 1 },
      affixPool: WEAPON_AFFIXES,
    },
    {
      id: 'injector',
      names: { de: 'Injektor', en: 'Injector' },
      category: 'weapon_1h',
      weapon: { kind: 'tech', scalesWith: 'int', scaling: 9_000 },
      base: { weaponDamage: 1 },
      affixPool: [...WEAPON_AFFIXES, 'con'],
    },
    {
      id: 'shield',
      names: { de: 'Schild', en: 'Shield' },
      category: 'shield',
      base: { armor: 2, firewall: 1 },
      affixPool: ARMOR_AFFIXES,
    },
    {
      id: 'neural_interface',
      names: { de: 'Neural-Interface', en: 'Neural interface' },
      category: 'head',
      base: { firewall: 2, armor: 1 },
      affixPool: ARMOR_AFFIXES,
    },
    {
      id: 'vest',
      names: { de: 'Panzerweste', en: 'Armor vest' },
      category: 'torso',
      base: { armor: 2, firewall: 1 },
      affixPool: ARMOR_AFFIXES,
    },
    {
      id: 'pants',
      names: { de: 'Hose', en: 'Pants' },
      category: 'legs',
      base: { armor: 1, firewall: 1 },
      affixPool: ARMOR_AFFIXES,
    },
    {
      id: 'boots',
      names: { de: 'Stiefel', en: 'Boots' },
      category: 'feet',
      base: { armor: 1, evasion: 1 },
      affixPool: ARMOR_AFFIXES,
    },
    {
      id: 'gloves',
      names: { de: 'Handschuhe', en: 'Gloves' },
      category: 'hands',
      base: { armor: 1, accuracy: 1 },
      affixPool: ARMOR_AFFIXES,
    },
    {
      id: 'implant',
      names: { de: 'Implantat', en: 'Implant' },
      category: 'implant',
      base: {},
      affixPool: IMPLANT_AFFIXES,
    },
    {
      id: 'core_implant',
      names: { de: 'Kern-Implantat', en: 'Core implant' },
      category: 'core_implant',
      base: {},
      affixPool: IMPLANT_AFFIXES,
    },
  ],
};

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
    firewall: { base: 10, perLevel: 3, per: { str: 140, int: 80, con: 60 } },
    // Tempo, Treffen und Ausweichen wachsen mit dem Level; GES gibt nur einen Vorsprung, damit
    // der Abstand zwischen den Klassen mit dem Level nicht immer größer wird.
    initiative: { base: 90, perLevel: 2, per: { dex: 6 }, max: 600 },
    accuracy: { base: 50, perLevel: 2, per: { dex: 6 } },
    evasion: { base: 20, perLevel: 2, per: { dex: 1 } },
    critChance: { base: 50, per: { dex: 30 }, max: 500 },
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
    winCredits: { base: 10, perOpponentLevel: 2 },
    // 5 Gegner × 2 belohnte Kämpfe (100 %, 50 %) = 10 belohnte Kämpfe am Tag
    dailyOpponents: 5,
    dailyTeamOpponents: 3,
    // Etwa ein bis zwei gewonnene Kämpfe wert
    opponentReroll: { base: 20, perLevel: 3 },
    // Vorkalibrierung: etwas unter dem typischen Stand eines Spielers gleichen Levels
    // (Balancing-Profile: gewöhnlich bis L20, selten L30–50, episch L80)
    botGear: [
      { fromLevel: 1, rarity: 2 },
      { fromLevel: 10, rarity: 3 },
      { fromLevel: 30, rarity: 5 },
      { fromLevel: 50, rarity: 7 },
      { fromLevel: 80, rarity: 9 },
    ],
  },
  items,
  loot: {
    // Gewichte pro Million Würfe: 70 %, 25 %, 4,9 %, 0,1 %, 0,001 %, Stern 16 kalibriert.
    rarityBands: [
      { from: 1, to: 3, weight: 700_000 },
      { from: 4, to: 6, weight: 250_000 },
      { from: 7, to: 9, weight: 49_000 },
      { from: 10, to: 12, weight: 1_000 },
      { from: 13, to: 15, weight: 10 },
      { from: 16, to: 16, weight: 1 },
    ],
  },
  crafting: {
    salvage: [
      { minTier: 1, material: 'scrap', base: 1, perLevels: 10 },
      { minTier: 3, material: 'circuits', base: 1, perLevels: 25 },
      { minTier: 5, material: 'quantum_cores', base: 1, perLevels: 50 },
    ],
    upgrade: {
      maxLevel: 10,
      bonusPerLevelPermille: 30,
      successPermille: [1000, 1000, 1000, 1000, 1000, 700, 600, 500, 400, 300],
      credits: { base: 20, perItemLevel: 2, perUpgrade: 15 },
      material: [
        'scrap',
        'scrap',
        'scrap',
        'circuits',
        'circuits',
        'circuits',
        'circuits',
        'quantum_cores',
        'quantum_cores',
        'quantum_cores',
      ],
    },
    transfer: {
      successPermille: [900, 700, 500, 300],
      credits: { base: 100, perItemLevel: 5 },
    },
    reroll: {
      credits: { base: 150, perItemLevel: 8 },
      material: 'circuits',
      materialAmount: 3,
    },
  },
  shop: {
    consumables: [
      { id: 'heal_injector', price: 40 },
      { id: 'backup_chip', price: 400 },
    ],
    rotationSize: 4,
    rotationMaxRarity: 6,
    priceCreditsPerBudget: 5,
    sellPermille: 200,
    renameCredits: 200,
    renameCooldownDays: 30,
  },
  dungeon: {
    runsPerDay: 3,
    fee: { base: 5, perLevel: 2 },
    levelOffset: 2,
    regenPermille: 100,
    healPermille: 400,
    // Vorkalibrierung: Heilung wirkt im Dungeon zu 60 %, sonst läuft der Medtech doppelt so tief
    healingPermille: 600,
    maxInjectors: 3,
    bossEvery: 5,
    boss: { hpPermille: 3_000, damage: 2_000 },
    modifiersFrom: 10,
    monstersEvery: 10,
    maxMonsters: 3,
    xpPerFloor: { base: 20, perLevel: 10 },
    creditsPerFloor: { base: 5, perLevel: 1 },
    maxRarityByFloor: [
      { fromFloor: 1, maxRarity: 9 },
      { fromFloor: 20, maxRarity: 12 },
      { fromFloor: 50, maxRarity: 15 },
      { fromFloor: 75, maxRarity: 16 },
    ],
    decisionTimeoutMs: 10 * 60 * 1000,
  },
  passiveXp: {
    message: {
      minXp: 15,
      maxXp: 25,
      minLength: 5,
      cooldownMs: 60_000,
      repeatWindowMs: 10 * 60_000,
    },
    // Level 10: volle XP bis 440, halbe bis 1 320 – höchstens 880 XP am Tag aus Chat.
    dailyCap: {
      soft: { base: 40, perLevel: 40 },
      hard: { base: 120, perLevel: 120 },
      overSoftPermille: 500,
    },
  },
  // Aufholbonus: mehr als 5 Level unter dem Median der Season → +50 % XP aus aktivem Spielen.
  catchUp: { levelGap: 5, bonusPermille: 500 },
  league: {
    divisionSize: 8,
    minDivisionSize: 4,
    maxDivisionSize: 10,
    promote: 2,
    relegate: 2,
    matchdayHour: 20,
    matchdayMinute: 0,
    lockMinutes: 60,
    placementGames: 5,
    points: { win: 3, draw: 1, loss: 0 },
    minPlayers: 4,
  },
};
