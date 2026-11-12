import { simulateBattle } from '../battle/engine.js';
import type { BattleRules, CombatantSnapshot } from '../battle/types.js';
import { botBuild } from '../bots/bot-build.js';
import { deriveSnapshot } from '../character/build.js';
import { CLASS_IDS, type ClassId, type GameConfig, type TargetSelector } from '../content/types.js';
import { dungeonFighter, planFloor, regenerate } from '../dungeon/dungeon.js';
import { rollItem, slotsFor, type Equipment } from '../items/items.js';
import { EQUIP_SLOTS, type ItemTemplate } from '../items/types.js';
import { ENGINE_VERSION } from '../version.js';

/**
 * Balancing-Simulationen (Spezifikation, Abschnitt 14): Gewinnraten-Matrix Klasse × Klasse und
 * Verteilung der erreichten Dungeon-Tiefe. Rein und deterministisch – gleicher Seed, gleiches
 * Ergebnis –, damit API, Worker und Skripte dieselben Zahlen liefern.
 */

/** Ausrüstungsstand der simulierten Charaktere: Rarität aller Items oder gar keine. */
export const GEAR_PROFILES = { none: 0, common: 3, rare: 7, epic: 11 } as const;
export type GearProfile = keyof typeof GEAR_PROFILES;

export interface MatchupInput {
  readonly level: number;
  /** Kämpfe je Paarung (je Seite die Hälfte, damit die Startposition nichts verzerrt). */
  readonly fightsPerPair: number;
  readonly gear: GearProfile;
  readonly seed: string;
  /** Abweichung von 50 % (Promille), ab der eine Paarung als Ausreißer gilt. */
  readonly outlierPermille?: number;
  readonly configVersion?: number;
}

export interface MatchupCell {
  readonly a: ClassId;
  readonly b: ClassId;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  /** Siegquote von a gegen b in Promille; Unentschieden zählen halb. */
  readonly winPermille: number;
  readonly avgRounds: number;
}

export interface MatchupResult {
  readonly level: number;
  readonly gear: GearProfile;
  readonly fights: number;
  readonly cells: readonly MatchupCell[];
  /** Gesamt-Siegquote je Klasse über alle Gegner (ohne Spiegelkämpfe). */
  readonly overall: Readonly<Record<ClassId, number>>;
  readonly outliers: readonly MatchupCell[];
}

/** Kampf-Momentaufnahme eines typischen Charakters der Klasse mit Ausrüstung nach Profil. */
export function simCombatant(
  config: GameConfig,
  input: { classId: ClassId; level: number; gear: GearProfile; seed: string; id: string },
): CombatantSnapshot {
  const build = botBuild(config, {
    id: input.id,
    name: input.id,
    classId: input.classId,
    level: input.level,
    seed: input.seed,
  });
  return deriveSnapshot(config, {
    ...build,
    equipment: simEquipment(config, input.classId, input.level, input.gear, input.seed),
  });
}

/** Ausrüstung nach Balancing-Profil (siehe GEAR_PROFILES). */
export function simEquipment(
  config: GameConfig,
  classId: ClassId,
  level: number,
  gear: GearProfile,
  seed: string,
): Equipment {
  return typicalEquipment(config, classId, level, GEAR_PROFILES[gear], seed);
}

/**
 * Ausrüstung eines computergesteuerten Gegners nach `pvp.botGear`: die Rarität der höchsten
 * Stufe, deren Level erreicht ist. Gleicher Seed, gleiche Items.
 */
export function botEquipment(
  config: GameConfig,
  classId: ClassId,
  level: number,
  seed: string,
): Equipment {
  let rarity = 0;
  for (const step of config.pvp.botGear ?? []) if (level >= step.fromLevel) rarity = step.rarity;
  return typicalEquipment(config, classId, level, rarity, seed);
}

/**
 * Füllt jeden Platz mit einer passenden Vorlage der Rarität (0 = keine Items). Die Waffe skaliert
 * möglichst mit dem Hauptattribut der Klasse, sonst nimmt sie die erste passende; Nebenhand
 * bleibt leer, wenn die Waffe zweihändig ist.
 */
export function typicalEquipment(
  config: GameConfig,
  classId: ClassId,
  level: number,
  rarity: number,
  seed: string,
): Equipment {
  if (rarity === 0) return {};
  const primary = config.classes[classId].primary;
  const templates = config.items.templates;
  const fits = (t: ItemTemplate, slot: (typeof EQUIP_SLOTS)[number]) =>
    slotsFor(t.category).includes(slot);
  const equipment: Record<string, ReturnType<typeof rollItem>> = {};
  for (const slot of EQUIP_SLOTS) {
    if (slot === 'off_hand' && equipment['main_hand']?.category === 'weapon_2h') continue;
    const candidates = templates.filter((t) => fits(t, slot));
    if (candidates.length === 0) continue;
    const pick =
      slot === 'main_hand'
        ? (candidates.find((t) => t.weapon?.scalesWith === primary) ?? candidates[0]!)
        : slot === 'off_hand'
          ? (candidates.find((t) => t.category === 'shield') ?? candidates[0]!)
          : candidates[0]!;
    equipment[slot] = rollItem(config, {
      templateId: pick.id,
      itemLevel: level,
      rarity,
      seed: `${seed}:${slot}`,
    });
  }
  return equipment as Equipment;
}

export function simulateMatchups(
  config: GameConfig,
  rules: BattleRules,
  input: MatchupInput,
): MatchupResult {
  const threshold = input.outlierPermille ?? 100;
  const half = Math.max(1, Math.floor(input.fightsPerPair / 2));
  const cells: MatchupCell[] = [];
  let fights = 0;
  for (const a of CLASS_IDS) {
    for (const b of CLASS_IDS) {
      let wins = 0;
      let losses = 0;
      let draws = 0;
      let rounds = 0;
      for (let i = 0; i < half * 2; i++) {
        const seed = `${input.seed}:${a}:${b}:${i}`;
        const me = simCombatant(config, {
          classId: a,
          level: input.level,
          gear: input.gear,
          seed: `${seed}:a`,
          id: 'a',
        });
        const foe = simCombatant(config, {
          classId: b,
          level: input.level,
          gear: input.gear,
          seed: `${seed}:b`,
          id: 'b',
        });
        // Abwechselnd als erstes und zweites Team, damit die Startposition nichts verzerrt
        const first = i % 2 === 0;
        const result = simulateBattle({
          engineVersion: ENGINE_VERSION,
          configVersion: input.configVersion ?? 0,
          seed,
          rules,
          teams: first ? [[me], [foe]] : [[foe], [me]],
        });
        const mine = first ? 0 : 1;
        if (result.winner === null) draws++;
        else if (result.winner === mine) wins++;
        else losses++;
        rounds += result.rounds;
        fights++;
      }
      const total = wins + losses + draws;
      cells.push({
        a,
        b,
        wins,
        losses,
        draws,
        winPermille: Math.round(((wins + draws / 2) * 1000) / total),
        avgRounds: Math.round((rounds * 10) / total) / 10,
      });
    }
  }
  const overall = Object.fromEntries(
    CLASS_IDS.map((c) => {
      const mine = cells.filter((x) => x.a === c && x.b !== c);
      const w = mine.reduce((s, x) => s + x.wins + x.draws / 2, 0);
      const n = mine.reduce((s, x) => s + x.wins + x.losses + x.draws, 0);
      return [c, n ? Math.round((w * 1000) / n) : 500];
    }),
  ) as Record<ClassId, number>;
  const outliers = cells.filter((c) => c.a !== c.b && Math.abs(c.winPermille - 500) > threshold);
  return { level: input.level, gear: input.gear, fights, cells, overall, outliers };
}

export interface DungeonSimInput {
  readonly level: number;
  /** Runs je Klasse. */
  readonly runsPerClass: number;
  readonly gear: GearProfile;
  readonly seed: string;
  /** Sicherheitsgrenze, damit eine zu leichte Konfiguration nicht endlos läuft. */
  readonly maxFloors?: number;
  readonly configVersion?: number;
}

export interface DungeonSimResult {
  readonly level: number;
  readonly gear: GearProfile;
  readonly runs: number;
  /** Anzahl Runs, die genau diese Etage als letzte geschafft haben (Index = Etage). */
  readonly histogram: readonly number[];
  readonly average: number;
  readonly median: number;
  readonly perClass: Readonly<Record<ClassId, { average: number; best: number }>>;
  /** Runs, die an der Sicherheitsgrenze abgebrochen wurden. */
  readonly capped: number;
}

/**
 * Läuft den Dungeon ohne Verbrauchsgüter immer weiter, bis der Charakter fällt (oder die
 * Sicherheitsgrenze erreicht ist), und zählt die geschafften Etagen.
 */
export function simulateDungeon(
  config: GameConfig,
  rules: BattleRules,
  input: DungeonSimInput,
): DungeonSimResult {
  const maxFloors = input.maxFloors ?? 100;
  const depths: number[] = [];
  const perClass = {} as Record<ClassId, { average: number; best: number }>;
  let capped = 0;
  for (const classId of CLASS_IDS) {
    const mine: number[] = [];
    for (let r = 0; r < input.runsPerClass; r++) {
      const seed = `${input.seed}:${classId}:${r}`;
      const me = dungeonFighter(
        config.dungeon,
        simCombatant(config, { classId, level: input.level, gear: input.gear, seed, id: 'me' }),
      );
      let state = { hp: me.stats.maxHp, energy: me.stats.energyMax };
      let floor = 0;
      while (floor < maxFloors) {
        const plan = planFloor(config, {
          characterLevel: input.level,
          floor: floor + 1,
          seed: `${seed}:${floor + 1}`,
        });
        const result = simulateBattle({
          engineVersion: ENGINE_VERSION,
          configVersion: input.configVersion ?? 0,
          seed: `${seed}:${floor + 1}:fight`,
          rules,
          teams: [[{ ...me, state }], [...plan.enemies]],
        });
        if (result.winner !== 0) break;
        floor++;
        const survivor = result.survivors.find((s) => s.id === me.id)!;
        state = regenerate(
          config.dungeon,
          { hp: survivor.hp, energy: survivor.energy },
          { hp: me.stats.maxHp, energy: me.stats.energyMax },
        );
      }
      if (floor >= maxFloors) capped++;
      mine.push(floor);
      depths.push(floor);
    }
    perClass[classId] = {
      average: Math.round((mine.reduce((s, x) => s + x, 0) * 10) / Math.max(1, mine.length)) / 10,
      best: Math.max(0, ...mine),
    };
  }
  const histogram = Array.from({ length: Math.max(0, ...depths) + 1 }, () => 0);
  for (const d of depths) histogram[d]!++;
  const sorted = [...depths].sort((x, y) => x - y);
  return {
    level: input.level,
    gear: input.gear,
    runs: depths.length,
    histogram,
    average: Math.round((depths.reduce((s, x) => s + x, 0) * 10) / Math.max(1, depths.length)) / 10,
    median: sorted.length ? sorted[sorted.length >> 1]! : 0,
    perClass,
    capped,
  };
}

// --- Team-Kämpfe (2v2, 3v3) -----------------------------------------------------

export type TeamSize = 2 | 3;

export interface TeamSimInput {
  readonly size: TeamSize;
  readonly level: number;
  /** Kämpfe je Paarung zweier Aufstellungen (je Seite die Hälfte). */
  readonly fightsPerPair: number;
  readonly gear: GearProfile;
  readonly seed: string;
  /** Team-Fokus beider Seiten (Standard: höchste Bedrohung wie bei neuen Teams). */
  readonly focus?: TargetSelector;
  /** Abweichung von 50 % (Promille), ab der eine Aufstellung als Ausreißer gilt. */
  readonly outlierPermille?: number;
  readonly configVersion?: number;
}

/** Ergebnis einer Aufstellung (Klassen sortiert, Doppelungen erlaubt) gegen alle anderen. */
export interface TeamComp {
  readonly classes: readonly ClassId[];
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  /** Siegquote gegen alle anderen Aufstellungen in Promille; Unentschieden zählen halb. */
  readonly winPermille: number;
  readonly avgRounds: number;
  /** Schwerster Gegner (niedrigste Quote dieser Aufstellung). */
  readonly worst: { readonly classes: readonly ClassId[]; readonly winPermille: number } | null;
}

/** Paarung zweier Aufstellungen (Index in `comps`); Quote aus Sicht von `a`. */
export interface TeamCell {
  readonly a: number;
  readonly b: number;
  readonly winPermille: number;
}

export interface TeamSimResult {
  readonly size: TeamSize;
  readonly level: number;
  readonly gear: GearProfile;
  readonly fights: number;
  /** Alle Aufstellungen, nach Siegquote absteigend. */
  readonly comps: readonly TeamComp[];
  /** Paarungen ohne Spiegel; `a` < `b` bezieht sich auf die Reihenfolge in `comps`. */
  readonly cells: readonly TeamCell[];
  /**
   * Beitrag je Klasse: mittlere Siegquote der Aufstellungen mit dieser Klasse, gewichtet mit der
   * Anzahl der Plätze, die sie dort belegt.
   */
  readonly perClass: Readonly<Record<ClassId, number>>;
  /** Mittlere Quote der Aufstellungen ohne doppelte Klasse gegen die mit Doppelung. */
  readonly mixedVsStacked: number | null;
  readonly outliers: readonly TeamComp[];
}

/** Alle Aufstellungen der Größe (Kombinationen mit Wiederholung, in CLASS_IDS-Reihenfolge). */
export function teamComps(size: TeamSize): ClassId[][] {
  const out: ClassId[][] = [];
  const walk = (from: number, acc: ClassId[]) => {
    if (acc.length === size) {
      out.push(acc);
      return;
    }
    for (let i = from; i < CLASS_IDS.length; i++) walk(i, [...acc, CLASS_IDS[i]!]);
  };
  walk(0, []);
  return out;
}

/**
 * Gewinnraten der Team-Aufstellungen: Jede Aufstellung kämpft gegen jede andere, abwechselnd als
 * erstes und zweites Team. Die Kämpfer sind typische Charaktere der Klasse (wie bei der Matrix),
 * mit Standard-Taktik und gemeinsamem Team-Fokus.
 */
export function simulateTeams(
  config: GameConfig,
  rules: BattleRules,
  input: TeamSimInput,
): TeamSimResult {
  const threshold = input.outlierPermille ?? 150;
  const focus = input.focus ?? 'threat';
  const comps = teamComps(input.size);
  const n = comps.length;
  const half = Math.max(1, Math.floor(input.fightsPerPair / 2));
  // Ergebnisse aus Sicht von i gegen j (i < j); die Gegenrichtung ergibt sich daraus.
  const score: number[][] = comps.map(() => comps.map(() => 0));
  const played: number[][] = comps.map(() => comps.map(() => 0));
  const wins = comps.map(() => 0);
  const losses = comps.map(() => 0);
  const draws = comps.map(() => 0);
  const rounds = comps.map(() => 0);
  let fights = 0;

  const team = (classes: readonly ClassId[], side: string, seed: string) =>
    classes.map((classId, slot) => ({
      ...simCombatant(config, {
        classId,
        level: input.level,
        gear: input.gear,
        seed: `${seed}:${side}${slot}`,
        id: `${side}${slot}`,
      }),
      focus,
    }));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = 0; k < half * 2; k++) {
        const seed = `${input.seed}:${input.size}:${i}:${j}:${k}`;
        const a = team(comps[i]!, 'a', seed);
        const b = team(comps[j]!, 'b', seed);
        const first = k % 2 === 0;
        const result = simulateBattle({
          engineVersion: ENGINE_VERSION,
          configVersion: input.configVersion ?? 0,
          seed,
          rules,
          teams: first ? [a, b] : [b, a],
        });
        const mine = first ? 0 : 1;
        let points: number;
        if (result.winner === null) {
          points = 1;
          draws[i]!++;
          draws[j]!++;
        } else if (result.winner === mine) {
          points = 2;
          wins[i]!++;
          losses[j]!++;
        } else {
          points = 0;
          losses[i]!++;
          wins[j]!++;
        }
        score[i]![j]! += points;
        score[j]![i]! += 2 - points;
        played[i]![j]!++;
        played[j]![i]!++;
        rounds[i]! += result.rounds;
        rounds[j]! += result.rounds;
        fights++;
      }
    }
  }

  const rate = (i: number, j: number) =>
    played[i]![j]! ? Math.round((score[i]![j]! * 500) / played[i]![j]!) : 500;
  const all = comps.map((classes, i): TeamComp => {
    const total = wins[i]! + losses[i]! + draws[i]!;
    let worst: TeamComp['worst'] = null;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const r = rate(i, j);
      if (!worst || r < worst.winPermille) worst = { classes: comps[j]!, winPermille: r };
    }
    return {
      classes,
      wins: wins[i]!,
      losses: losses[i]!,
      draws: draws[i]!,
      winPermille: total ? Math.round(((wins[i]! + draws[i]! / 2) * 1000) / total) : 500,
      avgRounds: total ? Math.round((rounds[i]! * 10) / total) / 10 : 0,
      worst,
    };
  });
  // Stabile Sortierung: Quote absteigend, bei Gleichstand die ursprüngliche Reihenfolge
  const order = all
    .map((_, i) => i)
    .sort((x, y) => all[y]!.winPermille - all[x]!.winPermille || x - y);
  const sorted = order.map((i) => all[i]!);
  const cells: TeamCell[] = [];
  for (let x = 0; x < n; x++)
    for (let y = x + 1; y < n; y++)
      cells.push({ a: x, b: y, winPermille: rate(order[x]!, order[y]!) });

  const perClass = Object.fromEntries(
    CLASS_IDS.map((c) => {
      let sum = 0;
      let weight = 0;
      for (const comp of all) {
        const copies = comp.classes.filter((x) => x === c).length;
        sum += comp.winPermille * copies;
        weight += copies;
      }
      return [c, weight ? Math.round(sum / weight) : 500];
    }),
  ) as Record<ClassId, number>;

  const stacked = (classes: readonly ClassId[]) => new Set(classes).size < classes.length;
  let mixScore = 0;
  let mixPlayed = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (!stacked(comps[i]!) && stacked(comps[j]!)) {
        mixScore += score[i]![j]!;
        mixPlayed += played[i]![j]!;
      }

  return {
    size: input.size,
    level: input.level,
    gear: input.gear,
    fights,
    comps: sorted,
    cells,
    perClass,
    mixedVsStacked: mixPlayed ? Math.round((mixScore * 500) / mixPlayed) : null,
    outliers: sorted.filter((c) => Math.abs(c.winPermille - 500) > threshold),
  };
}
