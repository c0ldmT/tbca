import { clamp, FP_ONE, FP_SCALE, fpMul, fpRound, roundDiv, type Fixed } from '../math/fixed.js';
import { Xoshiro128ss } from '../random/prng.js';
import { hashHex } from '../util/hash.js';
import { ENGINE_VERSION } from '../version.js';
import type {
  BattleEndReason,
  BattleEvent,
  BattleInput,
  BattleResult,
  BattleRules,
  CombatantSnapshot,
} from './types.js';

/** Startwerte laut Spezifikation, Abschnitt 6. Werden per Simulation kalibriert. */
export const DEFAULT_BATTLE_RULES: BattleRules = Object.freeze({
  actionThreshold: 1000,
  ticksPerRound: 10,
  baseHitChance: 8_500,
  hitChanceDivisor: 200,
  minHitChance: 500,
  maxHitChance: 9_500,
  varianceMin: 9_000,
  varianceMax: 11_000,
  defenseConstant: 50,
  suddenDeathRound: 30,
  suddenDeathStep: 1_000,
  maxRounds: 100,
});

const DEFAULT_THREAT = 100;

/** Veränderlicher Zustand eines Kämpfers während der Simulation. */
interface Fighter {
  readonly order: number;
  readonly team: number;
  readonly snapshot: CombatantSnapshot;
  readonly threat: number;
  hp: number;
  bar: number;
}

export class BattleInputError extends Error {
  override readonly name = 'BattleInputError';
}

/**
 * Simuliert einen Kampf N gegen N.
 *
 * Reine Funktion: kein Datenbank-, Netzwerk- oder Uhrzugriff, kein Math.random.
 * Gleiche Eingabe ergibt immer dasselbe Ergebnis und dasselbe Event-Log.
 *
 * Ablauf:
 * 1. Jeder Tick füllt die Initiative-Leiste aller lebenden Kämpfer um ihren Initiative-Wert.
 * 2. Wer `actionThreshold` erreicht, handelt (höchste Leiste zuerst, dann höhere Initiative,
 *    dann Reihenfolge der Eingabe); die Leiste sinkt um `actionThreshold`, der Rest bleibt.
 * 3. Phase 0 kennt nur den Basisangriff auf das Ziel mit der höchsten Bedrohung.
 *    Taktikregeln und Fähigkeiten folgen in Phase 1.
 * 4. Ende, sobald nur noch ein Team steht. Ab `suddenDeathRound` steigt der Schaden je Runde,
 *    nach `maxRounds` entscheidet der höhere prozentuale HP-Rest.
 *
 * Zufallsverbrauch pro Angriff (feste Reihenfolge): Trefferwurf, bei Treffer Crit-Wurf und Varianz.
 */
export function simulateBattle(input: BattleInput): BattleResult {
  if (input.engineVersion !== ENGINE_VERSION) {
    throw new BattleInputError(
      `Engine-Version ${input.engineVersion} wird nicht unterstützt (aktuell: ${ENGINE_VERSION})`,
    );
  }
  const rules = input.rules ?? DEFAULT_BATTLE_RULES;
  validateRules(rules);
  const fighters = createFighters(input.teams);
  const rng = Xoshiro128ss.fromSeed(input.seed);
  const events: BattleEvent[] = [];

  events.push({
    type: 'start',
    tick: 0,
    round: 1,
    combatants: fighters.map((f) => ({ id: f.snapshot.id, team: f.team, hp: f.hp })),
  });

  const maxTicks = rules.maxRounds * rules.ticksPerRound;
  let tick = 0;
  let round = 1;
  let winner: number | null = null;
  let reason: BattleEndReason = 'knockout';

  battle: for (;;) {
    if (tick === maxTicks) {
      reason = 'timeout';
      winner = decideByHpPercentage(fighters, input.teams.length);
      break;
    }
    tick++;

    const tickRound = Math.trunc((tick - 1) / rules.ticksPerRound) + 1;
    if (tickRound !== round) {
      round = tickRound;
      events.push({ type: 'round', tick, round });
      if (round >= rules.suddenDeathRound) {
        events.push({ type: 'sudden_death', tick, round, multiplier: suddenDeath(rules, round) });
      }
    }

    for (const f of fighters) {
      if (f.hp > 0) f.bar += f.snapshot.stats.initiative;
    }

    const ready = fighters
      .filter((f) => f.hp > 0 && f.bar >= rules.actionThreshold)
      .sort(
        (a, b) =>
          b.bar - a.bar ||
          b.snapshot.stats.initiative - a.snapshot.stats.initiative ||
          a.order - b.order,
      );

    for (const actor of ready) {
      if (actor.hp <= 0) continue; // in diesem Tick bereits besiegt
      actor.bar -= rules.actionThreshold;

      const target = selectTarget(actor, fighters);
      if (!target) break battle;

      events.push(basicAttack(actor, target, rules, round, tick, rng));
      if (target.hp === 0) {
        events.push({ type: 'defeat', tick, round, id: target.snapshot.id });
        const standing = teamsStanding(fighters);
        if (standing.length <= 1) {
          winner = standing[0] ?? null;
          break battle;
        }
      }
    }
  }

  events.push({ type: 'end', tick, round, winner, reason });

  return {
    engineVersion: ENGINE_VERSION,
    configVersion: input.configVersion,
    winner,
    reason,
    rounds: round,
    ticks: tick,
    survivors: fighters.filter((f) => f.hp > 0).map((f) => ({ id: f.snapshot.id, hp: f.hp })),
    events,
    logHash: hashHex(JSON.stringify(events)),
  };
}

function basicAttack(
  actor: Fighter,
  target: Fighter,
  rules: BattleRules,
  round: number,
  tick: number,
  rng: Xoshiro128ss,
): BattleEvent {
  const a = actor.snapshot;
  const t = target.snapshot;

  const hitChance = clamp(
    rules.baseHitChance +
      roundDiv((a.stats.accuracy - t.stats.evasion) * FP_SCALE, rules.hitChanceDivisor),
    rules.minHitChance,
    rules.maxHitChance,
  );
  const base = {
    type: 'action',
    tick,
    round,
    action: 'basic_attack',
    source: a.id,
    target: t.id,
  } as const;

  if (!rng.chance(hitChance, FP_SCALE)) {
    return { ...base, outcome: 'miss', value: 0, targetHp: target.hp, effects: [] };
  }

  // S_roh = (W + s · A) · M_Skill · M_Crit · V   (M_Skill = 1 für den Basisangriff,
  // M_Dreieck folgt mit den Klassen in Phase 1)
  let damage: Fixed = a.attack.base * FP_SCALE + a.attack.scaling * a.attack.attribute;
  const crit = rng.chance(a.stats.critChance, 1000);
  if (crit) damage = fpMul(damage, a.stats.critDamage);
  damage = fpMul(damage, rng.nextRange(rules.varianceMin, rules.varianceMax));
  damage = fpMul(damage, suddenDeath(rules, round));

  // S = S_roh · (1 − D / (D + K · L))
  const defense = a.attack.kind === 'physical' ? t.stats.armor : t.stats.firewall;
  const mitigation = roundDiv(defense * FP_SCALE, defense + rules.defenseConstant * a.level);
  damage = fpMul(damage, FP_ONE - mitigation);

  const value = Math.min(target.hp, Math.max(1, fpRound(damage)));
  target.hp -= value;

  return { ...base, outcome: 'hit', value, targetHp: target.hp, effects: crit ? ['crit'] : [] };
}

/** Schadensmultiplikator der Runde: 1,0 vor Sudden Death, danach +step je Runde. */
function suddenDeath(rules: BattleRules, round: number): Fixed {
  if (round < rules.suddenDeathRound) return FP_ONE;
  return FP_ONE + rules.suddenDeathStep * (round - rules.suddenDeathRound + 1);
}

/** Höchste Bedrohung, dann niedrigste HP, dann Reihenfolge der Eingabe. */
function selectTarget(actor: Fighter, fighters: readonly Fighter[]): Fighter | undefined {
  let best: Fighter | undefined;
  for (const f of fighters) {
    if (f.team === actor.team || f.hp <= 0) continue;
    if (
      !best ||
      f.threat > best.threat ||
      (f.threat === best.threat && (f.hp < best.hp || (f.hp === best.hp && f.order < best.order)))
    ) {
      best = f;
    }
  }
  return best;
}

function teamsStanding(fighters: readonly Fighter[]): number[] {
  const teams: number[] = [];
  for (const f of fighters) {
    if (f.hp > 0 && !teams.includes(f.team)) teams.push(f.team);
  }
  return teams;
}

/**
 * Team mit dem höchsten prozentualen HP-Rest; bei Gleichstand Unentschieden.
 * Verglichen wird per Kreuzmultiplikation, ganz ohne Gleitkomma.
 */
function decideByHpPercentage(fighters: readonly Fighter[], teamCount: number): number | null {
  const hp = new Array<number>(teamCount).fill(0);
  const max = new Array<number>(teamCount).fill(0);
  for (const f of fighters) {
    hp[f.team]! += f.hp;
    max[f.team]! += f.snapshot.stats.maxHp;
  }
  let best: number | null = null;
  let tie = false;
  for (let team = 0; team < teamCount; team++) {
    if (best === null) {
      best = team;
      continue;
    }
    const lhs = hp[team]! * max[best]!;
    const rhs = hp[best]! * max[team]!;
    if (lhs > rhs) {
      best = team;
      tie = false;
    } else if (lhs === rhs) {
      tie = true;
    }
  }
  return tie ? null : best;
}

function createFighters(teams: BattleInput['teams']): Fighter[] {
  if (teams.length < 2) throw new BattleInputError('Ein Kampf braucht mindestens zwei Teams');
  const ids = new Set<string>();
  const fighters: Fighter[] = [];
  teams.forEach((members, team) => {
    if (members.length === 0) throw new BattleInputError(`Team ${team} ist leer`);
    for (const snapshot of members) {
      validateSnapshot(snapshot);
      if (ids.has(snapshot.id)) {
        throw new BattleInputError(`Kämpfer-ID ${snapshot.id} ist doppelt`);
      }
      ids.add(snapshot.id);
      fighters.push({
        order: fighters.length,
        team,
        snapshot,
        threat: snapshot.stats.threat ?? DEFAULT_THREAT,
        hp: snapshot.stats.maxHp,
        bar: 0,
      });
    }
  });
  return fighters;
}

function requireInt(value: number, min: number, what: string, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new BattleInputError(`${what} muss eine ganze Zahl in [${min}, ${max}] sein: ${value}`);
  }
}

function validateSnapshot(c: CombatantSnapshot): void {
  const p = `Kämpfer ${c.id}:`;
  requireInt(c.level, 1, `${p} level`);
  requireInt(c.stats.maxHp, 1, `${p} maxHp`);
  requireInt(c.stats.armor, 0, `${p} armor`);
  requireInt(c.stats.firewall, 0, `${p} firewall`);
  requireInt(c.stats.initiative, 1, `${p} initiative`);
  requireInt(c.stats.accuracy, 0, `${p} accuracy`);
  requireInt(c.stats.evasion, 0, `${p} evasion`);
  requireInt(c.stats.critChance, 0, `${p} critChance`, 1000);
  requireInt(c.stats.critDamage, FP_ONE, `${p} critDamage`);
  requireInt(c.stats.threat ?? DEFAULT_THREAT, 0, `${p} threat`);
  requireInt(c.attack.base, 0, `${p} attack.base`);
  requireInt(c.attack.attribute, 0, `${p} attack.attribute`);
  requireInt(c.attack.scaling, 0, `${p} attack.scaling`);
}

function validateRules(r: BattleRules): void {
  requireInt(r.actionThreshold, 1, 'actionThreshold');
  requireInt(r.ticksPerRound, 1, 'ticksPerRound');
  requireInt(r.hitChanceDivisor, 1, 'hitChanceDivisor');
  requireInt(r.minHitChance, 0, 'minHitChance', FP_SCALE);
  requireInt(r.maxHitChance, r.minHitChance, 'maxHitChance', FP_SCALE);
  requireInt(r.baseHitChance, 0, 'baseHitChance', FP_SCALE);
  requireInt(r.varianceMin, 0, 'varianceMin');
  requireInt(r.varianceMax, r.varianceMin, 'varianceMax');
  requireInt(r.defenseConstant, 1, 'defenseConstant');
  requireInt(r.suddenDeathRound, 1, 'suddenDeathRound');
  requireInt(r.suddenDeathStep, 0, 'suddenDeathStep');
  requireInt(r.maxRounds, 1, 'maxRounds');
}
