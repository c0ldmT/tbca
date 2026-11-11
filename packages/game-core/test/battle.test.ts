import { describe, expect, it } from 'vitest';

import {
  BattleInputError,
  DEFAULT_BATTLE_RULES,
  ENGINE_VERSION,
  simulateBattle,
  type BattleEvent,
  type BattleInput,
} from '../src/index.js';
import { deepFreeze, duel, fighter, teamFight } from './fixtures.js';

const actions = (events: readonly BattleEvent[]) =>
  events.filter((e): e is Extract<BattleEvent, { type: 'action' }> => e.type === 'action');

describe('simulateBattle – Determinismus', () => {
  it('liefert für gleiche Eingaben identische Ergebnisse', () => {
    for (const make of [duel, teamFight]) {
      for (let i = 0; i < 25; i++) {
        const seed = `seed-${i}`;
        expect(simulateBattle(make(seed))).toEqual(simulateBattle(make(seed)));
      }
    }
  });

  it('verändert die Eingabe nicht', () => {
    const input = deepFreeze(teamFight());
    expect(() => simulateBattle(input)).not.toThrow();
  });

  it('ist über eine JSON-Momentaufnahme exakt reproduzierbar', () => {
    const input = teamFight('replay');
    const stored = JSON.parse(JSON.stringify(input)) as BattleInput;
    const original = simulateBattle(input);
    const replay = simulateBattle(stored);
    expect(replay.events).toEqual(original.events);
    expect(replay.logHash).toBe(original.logHash);
  });

  it('erzeugt mit anderen Seeds andere Kampfverläufe', () => {
    const hashes = new Set(Array.from({ length: 20 }, (_, i) => simulateBattle(duel(i)).logHash));
    expect(hashes.size).toBeGreaterThan(15);
  });

  it('hängt nicht von Laufzeitdetails ab (Referenz-Fingerabdrücke)', () => {
    // Ändert sich einer dieser Werte, hat sich die Kampflogik geändert:
    // dann ENGINE_VERSION erhöhen und die Referenzwerte bewusst neu setzen.
    expect(simulateBattle(duel('golden-duel')).logHash).toBe('082b6d66');
    expect(simulateBattle(teamFight('golden-team')).logHash).toBe('4f98931f');
  });
});

describe('simulateBattle – Regeln', () => {
  it('beendet einen Kampf mit Sieger und konsistentem Log', () => {
    const result = simulateBattle(duel('basic'));
    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.reason).toBe('knockout');
    expect(result.winner === 0 || result.winner === 1).toBe(true);

    const first = result.events[0];
    const last = result.events.at(-1);
    expect(first?.type).toBe('start');
    expect(last).toMatchObject({ type: 'end', winner: result.winner, reason: 'knockout' });

    const loser = result.winner === 0 ? 'gunner' : 'bruiser';
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'defeat', id: loser }));
    expect(result.survivors.map((s) => s.id)).not.toContain(loser);
  });

  it('zieht Schaden exakt von den HP ab', () => {
    const result = simulateBattle(teamFight('hp'));
    const hp = new Map<string, number>();
    const start = result.events[0];
    if (start?.type !== 'start') throw new Error('start fehlt');
    for (const c of start.combatants) hp.set(c.id, c.hp);
    for (const a of actions(result.events)) {
      const next = hp.get(a.target)! - a.value;
      expect(a.targetHp).toBe(next);
      hp.set(a.target, next);
      if (a.outcome === 'miss') expect(a.value).toBe(0);
      else expect(a.value).toBeGreaterThan(0);
      expect(Number.isInteger(a.value)).toBe(true);
    }
    for (const s of result.survivors) expect(hp.get(s.id)).toBe(s.hp);
  });

  it('lässt schnellere Kämpfer öfter handeln', () => {
    const input: BattleInput = {
      ...duel('initiative'),
      teams: [
        [fighter({ id: 'slow', stats: { maxHp: 5000, initiative: 100 } })],
        [fighter({ id: 'fast', stats: { maxHp: 5000, initiative: 200 } })],
      ],
    };
    const count = (id: string) =>
      actions(simulateBattle(input).events).filter((a) => a.source === id).length;
    const ratio = count('fast') / count('slow');
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });

  it('greift das Ziel mit der höchsten Bedrohung an', () => {
    const result = simulateBattle(teamFight('threat'));
    const firstHitsByB = actions(result.events).filter((a) => a.source.startsWith('b-'));
    expect(firstHitsByB[0]?.target).toBe('a-tank');
  });

  it('wechselt nach maxRounds in den Sudden Death und entscheidet nach HP-Rest', () => {
    const tank = (id: string, maxHp: number) =>
      fighter({
        id,
        stats: { maxHp, armor: 5000, firewall: 5000 },
        attack: { base: 1, attribute: 0 },
      });
    const input: BattleInput = {
      ...duel('timeout'),
      rules: { ...DEFAULT_BATTLE_RULES, maxRounds: 40 },
      teams: [[tank('big', 100_000)], [tank('small', 50_000)]],
    };
    const result = simulateBattle(input);
    expect(result.reason).toBe('timeout');
    expect(result.rounds).toBe(40);
    expect(result.winner).toBe(0);
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'sudden_death', round: 30, multiplier: 11_000 }),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'sudden_death', round: 40, multiplier: 21_000 }),
    );
  });

  it('wertet gleichen HP-Rest nach Zeitablauf als Unentschieden', () => {
    const wall = (id: string) =>
      fighter({ id, stats: { maxHp: 1000, evasion: 10_000 }, attack: { base: 1, attribute: 0 } });
    const result = simulateBattle({
      ...duel('draw'),
      rules: { ...DEFAULT_BATTLE_RULES, maxRounds: 3, minHitChance: 0 },
      teams: [[wall('a')], [wall('b')]],
    });
    expect(result.reason).toBe('timeout');
    expect(result.winner).toBeNull();
  });

  it('unterstützt mehrere gegen einen Boss', () => {
    const boss = fighter({ id: 'boss', level: 20, stats: { maxHp: 6000, armor: 300 } });
    const raiders = Array.from({ length: 6 }, (_, i) => fighter({ id: `raider-${i}` }));
    const result = simulateBattle({ ...duel('raid'), teams: [raiders, [boss]] });
    expect(result.winner).not.toBeUndefined();
    const sources = new Set(actions(result.events).map((a) => a.source));
    expect(sources.size).toBeGreaterThan(2);
  });

  it('lehnt ungültige Eingaben ab', () => {
    expect(() => simulateBattle({ ...duel(), engineVersion: ENGINE_VERSION + 1 })).toThrow(
      BattleInputError,
    );
    expect(() => simulateBattle({ ...duel(), teams: [[fighter({ id: 'x' })]] })).toThrow(
      BattleInputError,
    );
    expect(() =>
      simulateBattle({ ...duel(), teams: [[fighter({ id: 'x' })], [fighter({ id: 'x' })]] }),
    ).toThrow(/doppelt/);
    expect(() =>
      simulateBattle({
        ...duel(),
        teams: [[fighter({ id: 'x', stats: { initiative: 0 } })], [fighter({ id: 'y' })]],
      }),
    ).toThrow(/initiative/);
    expect(() =>
      simulateBattle({
        ...duel(),
        teams: [[fighter({ id: 'x', stats: { maxHp: 10.5 } })], [fighter({ id: 'y' })]],
      }),
    ).toThrow(/maxHp/);
  });
});
