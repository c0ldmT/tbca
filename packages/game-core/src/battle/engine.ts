import type {
  AbilityDef,
  Affinity,
  DamageKind,
  Effect,
  Modifiers,
  StatusKind,
  TacticCondition,
  TacticRule,
  TargetSelector,
} from '../content/types.js';
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
  triangleBonus: 1_500,
});

/** Pseudo-Fähigkeit für den Basisangriff mit der Waffe. */
export const BASIC_ATTACK = 'basic_attack';
const BASIC_ATTACK_DEF: AbilityDef = {
  id: BASIC_ATTACK,
  classId: null,
  target: 'enemy',
  energyCost: 0,
  cooldown: 0,
  unlockLevel: 1,
  effects: [{ type: 'damage', multiplier: FP_ONE }],
};

/** STR schlägt DEX, DEX schlägt INT, INT schlägt STR. */
const BEATS: Record<Exclude<Affinity, null>, Exclude<Affinity, null>> = {
  str: 'dex',
  dex: 'int',
  int: 'str',
};

interface Status {
  readonly kind: StatusKind;
  readonly source: string;
  /** Verbleibende eigene Züge des Trägers; Ablauf am Ende seines Zuges. */
  turns: number;
  /** Schild: verbleibende Stärke; DoT: Schaden pro Zug; Taunt: Bedrohung. */
  value: number;
  readonly modifiers?: Modifiers;
}

interface Fighter {
  readonly order: number;
  readonly team: number;
  readonly s: CombatantSnapshot;
  readonly abilities: ReadonlyMap<string, AbilityDef>;
  hp: number;
  bar: number;
  energy: number;
  readonly cooldowns: Map<string, number>;
  statuses: Status[];
}

export class BattleInputError extends Error {
  override readonly name = 'BattleInputError';
}

class Battle {
  readonly events: BattleEvent[] = [];
  tick = 0;
  round = 1;
  /** Gesetzt, sobald nur noch ein Team steht. */
  decided = false;
  winner: number | null = null;

  constructor(
    readonly fighters: Fighter[],
    readonly rules: BattleRules,
    readonly rng: Xoshiro128ss,
  ) {}

  private at() {
    return { tick: this.tick, round: this.round };
  }

  // --- Zug ---------------------------------------------------------------

  takeTurn(actor: Fighter): void {
    // 1. Schaden über Zeit wirkt zu Beginn des eigenen Zuges.
    for (const dot of actor.statuses.filter((st) => st.kind === 'dot')) {
      this.dealDamage(dot.source, actor, dot.value, false, true);
      if (this.decided || actor.hp === 0) return;
    }

    // 2. Betäubt: Zug entfällt.
    if (actor.statuses.some((st) => st.kind === 'stun')) {
      this.events.push({ type: 'stunned', id: actor.s.id, ...this.at() });
      this.endTurn(actor);
      return;
    }

    // 3. Energie und Abklingzeiten.
    actor.energy = Math.min(actor.s.stats.energyMax, actor.energy + actor.s.stats.energyRegen);
    for (const [id, cd] of actor.cooldowns) actor.cooldowns.set(id, Math.max(0, cd - 1));

    // 4. Aktion über Taktikregeln, sonst Basisangriff.
    const choice = this.chooseAction(actor);
    actor.energy -= choice.ability.energyCost;
    if (choice.ability.cooldown > 0) {
      // +1, weil der laufende Zug nicht mitzählt.
      actor.cooldowns.set(choice.ability.id, choice.ability.cooldown + 1);
    }
    this.events.push({
      type: 'action',
      source: actor.s.id,
      ability: choice.ability.id,
      energy: actor.energy,
      ...this.at(),
    });
    this.execute(actor, choice.ability, choice.targets);

    if (!this.decided && actor.hp > 0) this.endTurn(actor);
  }

  /** Statusdauern laufen am Ende des Zuges ihres Trägers ab. */
  private endTurn(actor: Fighter): void {
    for (const st of actor.statuses) st.turns -= 1;
    actor.statuses = actor.statuses.filter((st) => st.turns > 0);
  }

  // --- Aktionswahl ---------------------------------------------------------

  private chooseAction(actor: Fighter): { ability: AbilityDef; targets: Fighter[] } {
    for (const rule of actor.s.tactics) {
      const ability = rule.use === BASIC_ATTACK ? BASIC_ATTACK_DEF : actor.abilities.get(rule.use);
      if (!ability || !this.usable(actor, ability)) continue;
      const targets = this.resolveTargets(actor, ability, rule.target);
      if (targets.length === 0) continue;
      if (!this.conditionHolds(actor, rule.when, targets[0]!)) continue;
      return { ability, targets };
    }
    return { ability: BASIC_ATTACK_DEF, targets: this.resolveTargets(actor, BASIC_ATTACK_DEF) };
  }

  private usable(actor: Fighter, ability: AbilityDef): boolean {
    return actor.energy >= ability.energyCost && (actor.cooldowns.get(ability.id) ?? 0) === 0;
  }

  private resolveTargets(
    actor: Fighter,
    ability: AbilityDef,
    selector?: TargetSelector,
  ): Fighter[] {
    const enemies = this.fighters.filter((f) => f.team !== actor.team && f.hp > 0);
    const allies = this.fighters.filter((f) => f.team === actor.team && f.hp > 0);
    switch (ability.target) {
      case 'self':
        return [actor];
      case 'all_enemies':
        return enemies;
      case 'all_allies':
        return allies;
      case 'ally': {
        const sel = selector === 'self' ? 'self' : 'lowest_hp_ally';
        return sel === 'self' ? [actor] : pick(allies, byLowestHp);
      }
      case 'enemy': {
        switch (selector ?? actor.s.focus ?? 'threat') {
          case 'lowest_hp':
            return pick(enemies, byLowestHp);
          case 'highest_hp':
            return pick(enemies, (a, b) => -byLowestHp(a, b) || a.order - b.order);
          case 'healer': {
            const healer = enemies.find((f) => f.s.role === 'support');
            return healer ? [healer] : pick(enemies, (a, b) => this.byThreat(a, b));
          }
          case 'random':
            return enemies.length > 0 ? [enemies[this.rng.nextInt(enemies.length)]!] : [];
          case 'threat':
            return pick(enemies, (a, b) => this.byThreat(a, b));
          default:
            return []; // Selektor passt nicht zu einer Gegner-Fähigkeit
        }
      }
    }
  }

  private byThreat(a: Fighter, b: Fighter): number {
    return threatOf(b) - threatOf(a) || byLowestHp(a, b);
  }

  private conditionHolds(actor: Fighter, c: TacticCondition, target: Fighter): boolean {
    switch (c.type) {
      case 'always':
        return true;
      case 'self_hp_below':
        return actor.hp * 1000 < c.permille * actor.s.stats.maxHp;
      case 'ally_hp_below':
        return this.fighters.some(
          (f) => f.team === actor.team && f.hp > 0 && f.hp * 1000 < c.permille * f.s.stats.maxHp,
        );
      case 'energy_at_least':
        return actor.energy >= c.value;
      case 'target_has_status':
        return hasStatus(target, c.status);
      case 'target_lacks_status':
        return !hasStatus(target, c.status);
      case 'round_at_least':
        return this.round >= c.round;
      case 'enemies_at_least':
        return this.fighters.filter((f) => f.team !== actor.team && f.hp > 0).length >= c.count;
    }
  }

  // --- Ausführung ----------------------------------------------------------

  private execute(actor: Fighter, ability: AbilityDef, targets: Fighter[]): void {
    const hasDamage = ability.effects.some((e) => e.type === 'damage');
    for (const target of targets) {
      let landed = !hasDamage;
      for (const effect of ability.effects) {
        if (this.decided) return;
        if (target.hp === 0 && effect.type !== 'damage') break;
        if (effect.type === 'damage') {
          landed = this.applyDamageEffect(actor, target, effect) || landed;
        } else if (landed) {
          this.applyEffect(actor, target, effect);
        }
      }
    }
  }

  /** @returns true, wenn mindestens ein Treffer gelandet ist. */
  private applyDamageEffect(
    actor: Fighter,
    target: Fighter,
    effect: Extract<Effect, { type: 'damage' }>,
  ): boolean {
    let landed = false;
    for (let hit = 0; hit < (effect.hits ?? 1); hit++) {
      if (target.hp === 0 || this.decided) break;
      if (!this.rng.chance(this.hitChance(actor, target), FP_SCALE)) {
        this.events.push({ type: 'miss', source: actor.s.id, target: target.s.id, ...this.at() });
        continue;
      }
      landed = true;
      const mods = modifiersOf(actor);
      const crit = this.rng.chance(
        actor.s.stats.critChance + (mods.critChance ?? 0) + (effect.critBonus ?? 0),
        1000,
      );
      let raw = fpMul(weaponDamage(actor), effect.multiplier);
      if (crit) raw = fpMul(raw, actor.s.stats.critDamage);
      raw = fpMul(raw, this.rng.nextRange(this.rules.varianceMin, this.rules.varianceMax));
      const value = this.mitigate(
        actor,
        target,
        raw,
        effect.kind ?? actor.s.attack.kind,
        effect.pierce ?? 0,
      );
      this.dealDamage(actor.s.id, target, value, crit, false);
    }
    return landed;
  }

  private applyEffect(actor: Fighter, target: Fighter, effect: Effect): void {
    const at = this.at();
    const selfBonus = target === actor ? 1 : 0; // laufender Zug zählt nicht mit
    switch (effect.type) {
      case 'damage':
        return;
      case 'heal': {
        const mods = modifiersOf(actor);
        let amount = fpMul(scaled(actor, effect.amount), effect.multiplier);
        amount = fpMul(amount, Math.max(0, FP_ONE + (mods.healing ?? 0)));
        const value = Math.min(target.s.stats.maxHp - target.hp, Math.max(1, fpRound(amount)));
        target.hp += value;
        this.events.push({
          type: 'heal',
          source: actor.s.id,
          target: target.s.id,
          value,
          hp: target.hp,
          ...at,
        });
        return;
      }
      case 'shield': {
        const value = Math.max(1, fpRound(fpMul(scaled(actor, effect.amount), effect.multiplier)));
        // Ein Schild pro Ziel: der stärkere bleibt.
        const existing = target.statuses.find((st) => st.kind === 'shield');
        if (existing && existing.value >= value) return;
        target.statuses = target.statuses.filter((st) => st.kind !== 'shield');
        this.addStatus(
          actor,
          target,
          { kind: 'shield', source: actor.s.id, turns: effect.turns + selfBonus, value },
          effect.turns,
        );
        return;
      }
      case 'stun': {
        if (!this.rng.chance(effect.chance, 1000)) {
          this.events.push({ type: 'resist', target: target.s.id, status: 'stun', ...at });
          return;
        }
        this.addStatus(actor, target, {
          kind: 'stun',
          source: actor.s.id,
          turns: effect.turns,
          value: 0,
        });
        return;
      }
      case 'dot': {
        const raw = fpMul(weaponDamage(actor), effect.multiplier);
        const value = this.mitigate(actor, target, raw, effect.kind ?? actor.s.attack.kind, 0);
        this.addStatus(actor, target, {
          kind: 'dot',
          source: actor.s.id,
          turns: effect.turns,
          value,
        });
        return;
      }
      case 'modifier':
        this.addStatus(
          actor,
          target,
          {
            kind: effect.status,
            source: actor.s.id,
            turns: effect.turns + selfBonus,
            value: 0,
            modifiers: effect.modifiers,
          },
          effect.turns,
        );
        return;
      case 'taunt':
        target.statuses = target.statuses.filter((st) => st.kind !== 'taunt');
        this.addStatus(
          actor,
          target,
          {
            kind: 'taunt',
            source: actor.s.id,
            turns: effect.turns + selfBonus,
            value: effect.threat,
          },
          effect.turns,
        );
        return;
      case 'energy_drain': {
        const value = Math.min(target.energy, effect.amount);
        target.energy -= value;
        this.events.push({ type: 'energy', source: actor.s.id, target: target.s.id, value, ...at });
        return;
      }
      case 'cleanse': {
        const before = target.statuses.length;
        target.statuses = target.statuses.filter(
          (st) => st.kind !== 'debuff' && st.kind !== 'dot' && st.kind !== 'stun',
        );
        this.events.push({
          type: 'cleanse',
          target: target.s.id,
          removed: before - target.statuses.length,
          ...at,
        });
        return;
      }
    }
  }

  /** @param turns Dauer in Zügen des Ziels, wie sie im Log erscheinen soll. */
  private addStatus(actor: Fighter, target: Fighter, status: Status, turns = status.turns): void {
    target.statuses.push(status);
    this.events.push({
      type: 'status',
      source: actor.s.id,
      target: target.s.id,
      status: status.kind,
      turns,
      value: status.value,
      ...this.at(),
    });
  }

  // --- Formeln ---------------------------------------------------------------

  private hitChance(actor: Fighter, target: Fighter): Fixed {
    return clamp(
      this.rules.baseHitChance +
        roundDiv(
          (actor.s.stats.accuracy - target.s.stats.evasion) * FP_SCALE,
          this.rules.hitChanceDivisor,
        ),
      this.rules.minHitChance,
      this.rules.maxHitChance,
    );
  }

  /**
   * Rohschaden (Festkomma) → endgültiger ganzzahliger Schaden:
   * Dreieck, Buffs, Sudden Death, Abwehr D / (D + K · L) mit Durchdringung, erlittener Schaden.
   */
  private mitigate(
    actor: Fighter,
    target: Fighter,
    raw: Fixed,
    kind: DamageKind,
    pierce: number,
  ): number {
    const dealt = modifiersOf(actor);
    const taken = modifiersOf(target);
    let damage = raw;
    if (beats(actor.s.affinity, target.s.affinity))
      damage = fpMul(damage, FP_ONE + this.rules.triangleBonus);
    damage = fpMul(damage, Math.max(0, FP_ONE + (dealt.damageDealt ?? 0)));
    damage = fpMul(damage, suddenDeath(this.rules, this.round));

    const totalPierce = clamp(pierce + (dealt.pierce ?? 0), 0, 1000);
    const baseDefense = kind === 'physical' ? target.s.stats.armor : target.s.stats.firewall;
    const defense = roundDiv(baseDefense * (1000 - totalPierce), 1000);
    const mitigation = roundDiv(
      defense * FP_SCALE,
      defense + this.rules.defenseConstant * actor.s.level,
    );
    damage = fpMul(damage, FP_ONE - mitigation);
    damage = fpMul(damage, Math.max(0, FP_ONE + (taken.damageTaken ?? 0)));
    return Math.max(1, fpRound(damage));
  }

  private dealDamage(
    source: string,
    target: Fighter,
    amount: number,
    crit: boolean,
    dot: boolean,
  ): void {
    let absorbed = 0;
    const shield = target.statuses.find((st) => st.kind === 'shield');
    if (shield) {
      absorbed = Math.min(shield.value, amount);
      shield.value -= absorbed;
      if (shield.value === 0) target.statuses = target.statuses.filter((st) => st !== shield);
    }
    const value = Math.min(target.hp, amount - absorbed);
    target.hp -= value;
    this.events.push({
      type: 'damage',
      source,
      target: target.s.id,
      value,
      absorbed,
      hp: target.hp,
      crit,
      dot,
      ...this.at(),
    });
    if (target.hp === 0) {
      target.statuses = [];
      this.events.push({ type: 'defeat', id: target.s.id, ...this.at() });
      const standing = teamsStanding(this.fighters);
      if (standing.length <= 1) {
        this.decided = true;
        this.winner = standing[0] ?? null;
      }
    }
  }
}

/**
 * Simuliert einen Kampf N gegen N (1v1, 2v2, 3v3, 5–10 gegen einen Boss).
 *
 * Reine Funktion: kein Datenbank-, Netzwerk- oder Uhrzugriff, kein Math.random.
 * Gleiche Eingabe ergibt immer dasselbe Ergebnis und dasselbe Event-Log.
 *
 * Ablauf (Spezifikation, Abschnitt 6):
 * 1. Jeder Tick füllt die Initiative-Leiste aller lebenden Kämpfer um ihren Initiative-Wert;
 *    wer `actionThreshold` erreicht, handelt (höchste Leiste, dann Initiative, dann Eingabe).
 * 2. Zugbeginn: Schaden über Zeit, Betäubung, Energie-Regeneration, Abklingzeiten.
 * 3. Aktion: erste Taktikregel, deren Fähigkeit bereit ist, ein Ziel hat und deren Bedingung
 *    gilt; sonst Basisangriff auf das Ziel mit der höchsten Bedrohung.
 * 4. Ende, sobald nur noch ein Team steht; ab `suddenDeathRound` steigt der Schaden je Runde,
 *    nach `maxRounds` entscheidet der höhere prozentuale HP-Rest.
 *
 * Zufall wird in fester Reihenfolge verbraucht: je Treffer Trefferwurf, bei Treffer Crit-Wurf
 * und Varianz; Statuschancen und das Ziel „zufällig“ je einmal.
 */
export function simulateBattle(input: BattleInput): BattleResult {
  if (input.engineVersion !== ENGINE_VERSION) {
    throw new BattleInputError(
      `Engine-Version ${input.engineVersion} wird nicht unterstützt (aktuell: ${ENGINE_VERSION})`,
    );
  }
  const rules = input.rules ?? DEFAULT_BATTLE_RULES;
  validateRules(rules);
  const battle = new Battle(createFighters(input.teams), rules, Xoshiro128ss.fromSeed(input.seed));
  const { fighters, events } = battle;

  events.push({
    type: 'start',
    tick: 0,
    round: 1,
    combatants: fighters.map((f) => ({ id: f.s.id, team: f.team, hp: f.hp, energy: f.energy })),
  });

  const maxTicks = rules.maxRounds * rules.ticksPerRound;
  let reason: BattleEndReason = 'knockout';

  while (!battle.decided) {
    if (battle.tick === maxTicks) {
      reason = 'timeout';
      battle.winner = decideByHpPercentage(fighters, input.teams.length);
      break;
    }
    battle.tick++;

    const tickRound = Math.trunc((battle.tick - 1) / rules.ticksPerRound) + 1;
    if (tickRound !== battle.round) {
      battle.round = tickRound;
      events.push({ type: 'round', tick: battle.tick, round: battle.round });
      if (battle.round >= rules.suddenDeathRound) {
        events.push({
          type: 'sudden_death',
          tick: battle.tick,
          round: battle.round,
          multiplier: suddenDeath(rules, battle.round),
        });
      }
    }

    for (const f of fighters) {
      if (f.hp > 0) f.bar += f.s.stats.initiative;
    }
    const ready = fighters
      .filter((f) => f.hp > 0 && f.bar >= rules.actionThreshold)
      .sort(
        (a, b) => b.bar - a.bar || b.s.stats.initiative - a.s.stats.initiative || a.order - b.order,
      );

    for (const actor of ready) {
      if (battle.decided) break;
      if (actor.hp <= 0) continue; // in diesem Tick bereits besiegt
      actor.bar -= rules.actionThreshold;
      battle.takeTurn(actor);
    }
  }

  events.push({
    type: 'end',
    tick: battle.tick,
    round: battle.round,
    winner: battle.winner,
    reason,
  });

  return {
    engineVersion: ENGINE_VERSION,
    configVersion: input.configVersion,
    winner: battle.winner,
    reason,
    rounds: battle.round,
    ticks: battle.tick,
    survivors: fighters
      .filter((f) => f.hp > 0)
      .map((f) => ({ id: f.s.id, hp: f.hp, energy: f.energy })),
    events,
    logHash: hashHex(JSON.stringify(events)),
  };
}

// --- Hilfsfunktionen -----------------------------------------------------------

function weaponDamage(f: Fighter): Fixed {
  return f.s.attack.base * FP_SCALE + f.s.attack.scaling * f.s.attack.attribute;
}

function scaled(
  f: Fighter,
  s: { base: number; scalesWith: keyof Fighter['s']['attributes']; scaling: Fixed },
): Fixed {
  return s.base * FP_SCALE + s.scaling * f.s.attributes[s.scalesWith];
}

function modifiersOf(f: Fighter): Required<Modifiers> {
  const total = { damageDealt: 0, damageTaken: 0, critChance: 0, pierce: 0, healing: 0 };
  for (const m of [f.s.modifiers, ...f.statuses.map((st) => st.modifiers)]) {
    if (!m) continue;
    total.damageDealt += m.damageDealt ?? 0;
    total.damageTaken += m.damageTaken ?? 0;
    total.critChance += m.critChance ?? 0;
    total.pierce += m.pierce ?? 0;
    total.healing += m.healing ?? 0;
  }
  return total;
}

function threatOf(f: Fighter): number {
  return (
    f.s.stats.threat + f.statuses.reduce((sum, st) => sum + (st.kind === 'taunt' ? st.value : 0), 0)
  );
}

function hasStatus(f: Fighter, kind: StatusKind): boolean {
  return f.statuses.some((st) => st.kind === kind);
}

/** Niedrigster prozentualer HP-Stand zuerst (Kreuzmultiplikation), dann Eingabe-Reihenfolge. */
function byLowestHp(a: Fighter, b: Fighter): number {
  return a.hp * b.s.stats.maxHp - b.hp * a.s.stats.maxHp || a.order - b.order;
}

function pick(list: Fighter[], compare: (a: Fighter, b: Fighter) => number): Fighter[] {
  let best: Fighter | undefined;
  for (const f of list) if (!best || compare(f, best) < 0) best = f;
  return best ? [best] : [];
}

function beats(attacker: Affinity, defender: Affinity): boolean {
  return attacker !== null && defender !== null && BEATS[attacker] === defender;
}

/** Schadensmultiplikator der Runde: 1,0 vor Sudden Death, danach +step je Runde. */
function suddenDeath(rules: BattleRules, round: number): Fixed {
  if (round < rules.suddenDeathRound) return FP_ONE;
  return FP_ONE + rules.suddenDeathStep * (round - rules.suddenDeathRound + 1);
}

function teamsStanding(fighters: readonly Fighter[]): number[] {
  const teams: number[] = [];
  for (const f of fighters) if (f.hp > 0 && !teams.includes(f.team)) teams.push(f.team);
  return teams;
}

/** Team mit dem höchsten prozentualen HP-Rest; bei Gleichstand Unentschieden. */
function decideByHpPercentage(fighters: readonly Fighter[], teamCount: number): number | null {
  const hp = new Array<number>(teamCount).fill(0);
  const max = new Array<number>(teamCount).fill(0);
  for (const f of fighters) {
    hp[f.team]! += f.hp;
    max[f.team]! += f.s.stats.maxHp;
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
    for (const s of members) {
      validateSnapshot(s);
      if (ids.has(s.id)) throw new BattleInputError(`Kämpfer-ID ${s.id} ist doppelt`);
      ids.add(s.id);
      fighters.push({
        order: fighters.length,
        team,
        s,
        abilities: new Map(s.abilities.map((a) => [a.id, a])),
        hp: s.state?.hp ?? s.stats.maxHp,
        bar: 0,
        energy: Math.min(s.state?.energy ?? s.stats.energyStart, s.stats.energyMax),
        cooldowns: new Map(),
        statuses: [],
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
  const st = c.stats;
  requireInt(st.maxHp, 1, `${p} maxHp`);
  requireInt(st.armor, 0, `${p} armor`);
  requireInt(st.firewall, 0, `${p} firewall`);
  requireInt(st.initiative, 1, `${p} initiative`);
  requireInt(st.accuracy, 0, `${p} accuracy`);
  requireInt(st.evasion, 0, `${p} evasion`);
  requireInt(st.critChance, 0, `${p} critChance`, 1000);
  requireInt(st.critDamage, FP_ONE, `${p} critDamage`);
  requireInt(st.threat, 0, `${p} threat`);
  requireInt(st.energyMax, 0, `${p} energyMax`);
  requireInt(st.energyStart, 0, `${p} energyStart`);
  requireInt(st.energyRegen, 0, `${p} energyRegen`);
  if (c.state) {
    requireInt(c.state.hp, 1, `${p} state.hp`, st.maxHp);
    requireInt(c.state.energy, 0, `${p} state.energy`, st.energyMax);
  }
  requireInt(c.attack.base, 0, `${p} attack.base`);
  requireInt(c.attack.attribute, 0, `${p} attack.attribute`);
  requireInt(c.attack.scaling, 0, `${p} attack.scaling`);
  for (const [name, value] of Object.entries(c.attributes)) requireInt(value, 0, `${p} ${name}`);
  for (const ability of c.abilities) {
    requireInt(ability.energyCost, 0, `${p} ${ability.id}.energyCost`);
    requireInt(ability.cooldown, 0, `${p} ${ability.id}.cooldown`);
  }
  const known = new Set([BASIC_ATTACK, ...c.abilities.map((a) => a.id)]);
  for (const rule of c.tactics as readonly TacticRule[]) {
    if (!known.has(rule.use)) {
      throw new BattleInputError(`${p} Taktikregel nutzt ${rule.use}, das nicht im Loadout ist`);
    }
  }
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
  requireInt(r.triangleBonus, 0, 'triangleBonus');
}
