import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GAME_CONFIG,
  formDivisions,
  roundRobin,
  standings,
  validateGameConfig,
  type LeagueEntrant,
} from '../src/index.js';

const rules = DEFAULT_GAME_CONFIG.league;
const ids = (n: number, p = 'c') => Array.from({ length: n }, (_, i) => `${p}${i}`);
const fresh = (n: number): LeagueEntrant[] =>
  ids(n).map((id, i) => ({ characterId: id, rating: 2000 - i * 10, previous: null }));

describe('Liga: Spielplan', () => {
  it('lässt bei gerader Zahl jeden einmal gegen jeden spielen', () => {
    const days = roundRobin(ids(8));
    expect(days).toHaveLength(7);
    const seen = new Set<string>();
    for (const day of days) {
      const playing = day.flatMap((p) => [p.a, p.b]);
      expect(new Set(playing).size).toBe(8);
      for (const p of day) seen.add([p.a, p.b].sort().join('-'));
    }
    expect(seen.size).toBe(28);
  });

  it('macht bei ungerader Zahl je Spieltag einen spielfrei', () => {
    const days = roundRobin(ids(5));
    expect(days).toHaveLength(5);
    for (const day of days) expect(day.filter((p) => p.b === null)).toHaveLength(1);
    const byes = days.map((d) => d.find((p) => p.b === null)!.a);
    expect(new Set(byes).size).toBe(5);
  });

  it('wechselt die Seiten', () => {
    const first = roundRobin(ids(8))
      .flat()
      .filter((p) => p.a === 'c0' || p.b === 'c0');
    const home = first.filter((p) => p.a === 'c0').length;
    expect(home).toBeGreaterThan(1);
    expect(home).toBeLessThan(7);
  });
});

describe('Liga: Einteilung', () => {
  it('teilt Neue nach Rating in Divisionen der Zielgröße', () => {
    const divisions = formDivisions(rules, fresh(16));
    expect(divisions).toEqual([ids(16).slice(0, 8), ids(16).slice(8)]);
  });

  it('schneidet gleichmäßig in möglichst wenige Divisionen', () => {
    const divisions = formDivisions(rules, fresh(19));
    expect(divisions.map((d) => d.length)).toEqual([10, 9]);
    expect(formDivisions(rules, fresh(23)).map((d) => d.length)).toEqual([8, 8, 7]);
    expect(formDivisions(rules, fresh(12)).map((d) => d.length)).toEqual([6, 6]);
    expect(formDivisions(rules, fresh(3))).toEqual([]);
  });

  it('lässt Auf- und Absteiger die Division wechseln', () => {
    const entrants: LeagueEntrant[] = [
      ...ids(8, 'top').map((id, i) => ({
        characterId: id,
        rating: 1800,
        previous: {
          division: 0,
          place: i + 1,
          movement: i >= 6 ? ('down' as const) : ('stay' as const),
        },
      })),
      ...ids(8, 'low').map((id, i) => ({
        characterId: id,
        rating: 1500,
        previous: {
          division: 1,
          place: i + 1,
          movement: i < 2 ? ('up' as const) : ('stay' as const),
        },
      })),
    ];
    const [top, low] = formDivisions(rules, entrants);
    expect(top).toEqual([...ids(6, 'top'), 'low0', 'low1']);
    expect(low).toEqual(['top6', 'top7', ...ids(8, 'low').slice(2)]);
  });

  it('reiht Neue vor dem ersten Bisherigen mit niedrigerem Rating ein', () => {
    const old: LeagueEntrant[] = ids(8).map((id, i) => ({
      characterId: id,
      rating: 1900 - i * 50,
      previous: { division: 0, place: i + 1, movement: 'stay' },
    }));
    const order = formDivisions({ ...rules, divisionSize: 10 }, [
      ...old,
      { characterId: 'new', rating: 1780, previous: null },
    ]).flat();
    expect(order.indexOf('new')).toBe(3);
  });
});

describe('Liga: Tabelle', () => {
  const members = ids(4).map((id, i) => ({ characterId: id, rating: 1500 - i }));
  it('zählt Punkte und markiert Auf- und Abstieg', () => {
    const rows = standings(
      { ...rules, promote: 1, relegate: 1 },
      {
        members,
        results: [
          { a: 'c0', b: 'c1', winner: 'c1' },
          { a: 'c2', b: 'c3', winner: null },
          { a: 'c1', b: 'c2', winner: 'c1' },
          { a: 'c0', b: 'c3', winner: 'c0' },
        ],
        division: 1,
        divisions: 3,
      },
    );
    expect(rows.map((r) => [r.characterId, r.points, r.movement])).toEqual([
      ['c1', 6, 'up'],
      ['c0', 3, 'stay'],
      ['c2', 1, 'stay'],
      ['c3', 1, 'down'],
    ]);
  });

  it('entscheidet Gleichstand über den direkten Vergleich', () => {
    const rows = standings(rules, {
      members,
      results: [
        { a: 'c3', b: 'c0', winner: 'c3' },
        { a: 'c0', b: 'c1', winner: 'c0' },
      ],
      division: 0,
      divisions: 1,
    });
    // c0 und c3 je 3 Punkte und 1 Sieg; c3 gewann das direkte Duell
    expect(rows.slice(0, 2).map((r) => r.characterId)).toEqual(['c3', 'c0']);
    expect(rows.every((r) => r.movement === 'stay')).toBe(true);
  });

  it('prüft die Liga-Regeln', () => {
    const c = DEFAULT_GAME_CONFIG;
    expect(validateGameConfig({ ...c, league: { ...c.league, minDivisionSize: 12 } })).toContain(
      'Liga: Mindest- ≤ Ziel- ≤ Höchstgröße der Division',
    );
  });
});
