import { describe, expect, it } from 'vitest';

import {
  applyPassiveCap,
  DEFAULT_GAME_CONFIG as config,
  messageXp,
  Xoshiro128ss,
} from '../src/index.js';

describe('Aktivitäts-XP', () => {
  it('gibt 15–25 XP ab 5 Zeichen', () => {
    const rng = Xoshiro128ss.fromSeed('msg');
    expect(messageXp(config, 4, rng)).toBe(0);
    for (let i = 0; i < 100; i++) {
      const xp = messageXp(config, 12, rng);
      expect(xp).toBeGreaterThanOrEqual(15);
      expect(xp).toBeLessThanOrEqual(25);
    }
  });

  it('deckelt passiv: voll bis zur ersten Schwelle, dann die Hälfte, dann nichts', () => {
    // Level 10: soft 440, hard 1 320
    expect(applyPassiveCap(config, { level: 10, rawToday: 0, amount: 20 })).toEqual({
      awarded: 20,
      rawToday: 20,
    });
    expect(applyPassiveCap(config, { level: 10, rawToday: 430, amount: 20 })).toEqual({
      awarded: 15,
      rawToday: 450,
    });
    expect(applyPassiveCap(config, { level: 10, rawToday: 1310, amount: 20 })).toEqual({
      awarded: 5,
      rawToday: 1320,
    });
    expect(applyPassiveCap(config, { level: 10, rawToday: 1320, amount: 20 })).toEqual({
      awarded: 0,
      rawToday: 1320,
    });
  });

  it('bleibt deutlich unter den Tages-XP eines aktiven Spielers', () => {
    let raw = 0;
    let total = 0;
    for (let i = 0; i < 1000; i++) {
      const r = applyPassiveCap(config, { level: 10, rawToday: raw, amount: 25 });
      raw = r.rawToday;
      total += r.awarded;
    }
    expect(total).toBe(880);
    // Aktiv auf Level 10: 10 gewertete Siege (je 240 XP) plus 3 Dungeon-Runs mit je 5 Etagen.
    const active = 10 * (40 + 20 * 10) + 3 * 5 * (20 + 10 * 10);
    expect(total / active).toBeLessThan(0.4);
  });
});
