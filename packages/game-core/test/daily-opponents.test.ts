import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GAME_CONFIG,
  opponentRerollCost,
  pickDailyOpponents,
  validateGameConfig,
} from '../src/index.js';

const rules = DEFAULT_GAME_CONFIG.pvp;
const pool = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, level: 20 + (i % 5), isBot: false })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, level: 20, isBot: true })),
  { id: 'far', level: 60, isBot: false },
];

describe('Tagesgegner', () => {
  it('wählt reproduzierbar je Seed und anders an einem anderen Tag', () => {
    const pick = (seed: string) =>
      pickDailyOpponents(rules, { level: 21, candidates: pool, seed, testSeason: false });
    expect(pick('c:2026-11-12')).toEqual(pick('c:2026-11-12'));
    expect(pick('c:2026-11-12')).toHaveLength(rules.dailyOpponents);
    expect(pick('c:2026-11-12')).not.toEqual(pick('c:2026-11-13'));
  });

  it('nimmt in echten Seasons echte Spieler vor Bots, in Test-Seasons beide', () => {
    const real = pickDailyOpponents(rules, {
      level: 21,
      candidates: pool,
      seed: 's',
      testSeason: false,
    });
    expect(real.every((id) => id.startsWith('p'))).toBe(true);
    const few = pool.filter((c) => c.isBot || c.id === 'p0');
    const filled = pickDailyOpponents(rules, {
      level: 21,
      candidates: few,
      seed: 's',
      testSeason: false,
    });
    expect(filled[0]).toBe('p0');
    expect(filled).toHaveLength(5);
    const test = pickDailyOpponents(rules, {
      level: 20,
      candidates: pool,
      seed: 'x',
      testSeason: true,
    });
    expect(test).toHaveLength(5);
  });

  it('greift außerhalb des Belohnungsfensters nur auf, wenn es nicht reicht', () => {
    const near = pool.slice(0, 3);
    const out = pickDailyOpponents(rules, {
      level: 21,
      candidates: [...near, pool.at(-1)!],
      seed: 's',
      testSeason: false,
    });
    expect(out.slice(0, 3).sort()).toEqual(['p0', 'p1', 'p2']);
    expect(out[3]).toBe('far');
  });

  it('prüft, dass das Tageslimit mit den Tagesgegnern erreichbar ist', () => {
    const c = DEFAULT_GAME_CONFIG;
    expect(validateGameConfig({ ...c, pvp: { ...c.pvp, dailyOpponents: 4 } })).toContain(
      'PvP: Mit den Tagesgegnern ist das Tageslimit belohnter Kämpfe nicht erreichbar',
    );
    expect(validateGameConfig(c)).toEqual([]);
  });

  it('meidet beim Neuwürfeln die bisherige Auswahl, solange es reicht', () => {
    const first = pickDailyOpponents(rules, {
      level: 21,
      candidates: pool,
      seed: 's',
      testSeason: true,
    });
    const again = pickDailyOpponents(rules, {
      level: 21,
      candidates: pool,
      seed: 's:reroll',
      testSeason: true,
      exclude: first,
    });
    expect(again.filter((id) => first.includes(id))).toEqual([]);
    expect(opponentRerollCost(rules, 10)).toBe(50);
  });

  it('wählt für Teams die eigene, kleinere Anzahl', () => {
    const teams = pickDailyOpponents(rules, {
      level: 21,
      candidates: pool,
      seed: 'team:x:2026-11-12',
      testSeason: false,
      count: rules.dailyTeamOpponents,
    });
    expect(teams).toHaveLength(3);
    expect(teams.every((id) => id.startsWith('p'))).toBe(true);
    const c = DEFAULT_GAME_CONFIG;
    expect(validateGameConfig({ ...c, pvp: { ...c.pvp, dailyTeamOpponents: 0 } })).toContain(
      'PvP: gegnerische Tages-Teams müssen zwischen 1 und 20 liegen',
    );
  });
});
