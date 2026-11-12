import { describe, expect, it } from 'vitest';

import {
  CLASS_IDS,
  DEFAULT_BATTLE_RULES,
  DEFAULT_GAME_CONFIG,
  simEquipment,
  simulateDungeon,
  simulateMatchups,
} from '../src/index.js';

describe('Balancing-Simulation', () => {
  it('liefert eine vollständige, reproduzierbare Gewinnraten-Matrix', () => {
    const input = { level: 10, fightsPerPair: 4, gear: 'common' as const, seed: 'sim' };
    const a = simulateMatchups(DEFAULT_GAME_CONFIG, DEFAULT_BATTLE_RULES, input);
    const b = simulateMatchups(DEFAULT_GAME_CONFIG, DEFAULT_BATTLE_RULES, input);
    expect(a).toEqual(b);
    expect(a.cells).toHaveLength(CLASS_IDS.length ** 2);
    expect(a.fights).toBe(CLASS_IDS.length ** 2 * 4);
    for (const c of a.cells) {
      expect(c.wins + c.losses + c.draws).toBe(4);
      expect(c.winPermille).toBeGreaterThanOrEqual(0);
      expect(c.winPermille).toBeLessThanOrEqual(1000);
    }
    // Spiegelbild: a gegen b und b gegen a ergänzen sich ungefähr nicht zwingend, aber jede
    // Klasse hat eine Gesamtquote
    expect(Object.keys(a.overall).sort()).toEqual([...CLASS_IDS].sort());
  });

  it('markiert Ausreißer nach Schwelle', () => {
    const r = simulateMatchups(DEFAULT_GAME_CONFIG, DEFAULT_BATTLE_RULES, {
      level: 10,
      fightsPerPair: 2,
      gear: 'none',
      seed: 'x',
      outlierPermille: 0,
    });
    expect(r.outliers.every((c) => c.a !== c.b && c.winPermille !== 500)).toBe(true);
  });

  it('rüstet je Profil aus, die Waffe passend zum Hauptattribut', () => {
    expect(simEquipment(DEFAULT_GAME_CONFIG, 'gunner', 10, 'none', 's')).toEqual({});
    const gear = simEquipment(DEFAULT_GAME_CONFIG, 'gunner', 10, 'rare', 's');
    expect(gear.main_hand?.rarity).toBe(7);
    const weapon = DEFAULT_GAME_CONFIG.items.templates.find(
      (t) => t.id === gear.main_hand?.templateId,
    );
    expect(weapon?.weapon?.scalesWith).toBe('dex');
  });

  it('verteilt die erreichte Dungeon-Tiefe', () => {
    const r = simulateDungeon(DEFAULT_GAME_CONFIG, DEFAULT_BATTLE_RULES, {
      level: 10,
      runsPerClass: 2,
      gear: 'common',
      seed: 'd',
      maxFloors: 30,
    });
    expect(r.runs).toBe(CLASS_IDS.length * 2);
    expect(r.histogram.reduce((s, x) => s + x, 0)).toBe(r.runs);
    expect(r.average).toBeGreaterThan(0);
    expect(r.median).toBeLessThanOrEqual(30);
  });
});
