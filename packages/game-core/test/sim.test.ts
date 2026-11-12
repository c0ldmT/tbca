import { describe, expect, it } from 'vitest';

import {
  CLASS_IDS,
  DEFAULT_BATTLE_RULES,
  DEFAULT_GAME_CONFIG,
  botEquipment,
  simEquipment,
  validateGameConfig,
  simulateDungeon,
  simulateMatchups,
  simulateTeams,
  teamComps,
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

  it('zählt alle Team-Aufstellungen mit Wiederholung', () => {
    expect(teamComps(2)).toHaveLength(10);
    expect(teamComps(3)).toHaveLength(20);
    expect(teamComps(3)).toContainEqual(['medtech', 'medtech', 'medtech']);
  });

  it('simuliert Team-Kämpfe vollständig und reproduzierbar', () => {
    const input = {
      size: 2 as const,
      level: 10,
      fightsPerPair: 2,
      gear: 'common' as const,
      seed: 't',
    };
    const a = simulateTeams(DEFAULT_GAME_CONFIG, DEFAULT_BATTLE_RULES, input);
    expect(a).toEqual(simulateTeams(DEFAULT_GAME_CONFIG, DEFAULT_BATTLE_RULES, input));
    expect(a.comps).toHaveLength(10);
    expect(a.cells).toHaveLength(45);
    expect(a.fights).toBe(45 * 2);
    // Jede Aufstellung spielt 9 Paarungen × 2 Kämpfe
    for (const c of a.comps) expect(c.wins + c.losses + c.draws).toBe(18);
    // absteigend sortiert
    for (let i = 1; i < a.comps.length; i++)
      expect(a.comps[i - 1]!.winPermille).toBeGreaterThanOrEqual(a.comps[i]!.winPermille);
    // Siege und Niederlagen gleichen sich über alle Aufstellungen aus
    const w = a.comps.reduce((s, c) => s + c.wins, 0);
    const l = a.comps.reduce((s, c) => s + c.losses, 0);
    expect(w).toBe(l);
    expect(Object.keys(a.perClass).sort()).toEqual([...CLASS_IDS].sort());
    expect(a.mixedVsStacked).not.toBeNull();
  });

  it('rüstet Bots nach Level-Stufen aus', () => {
    const c = DEFAULT_GAME_CONFIG;
    const at = (level: number) => botEquipment(c, 'bruiser', level, 'b').torso?.rarity;
    expect(at(1)).toBe(2);
    expect(at(29)).toBe(3);
    expect(at(30)).toBe(5);
    expect(at(80)).toBe(9);
    expect(botEquipment(c, 'bruiser', 30, 'b')).toEqual(botEquipment(c, 'bruiser', 30, 'b'));
    expect(botEquipment({ ...c, pvp: { ...c.pvp, botGear: [] } }, 'bruiser', 30, 'b')).toEqual({});
  });

  it('prüft die Bot-Ausrüstung in der Konfiguration', () => {
    const c = DEFAULT_GAME_CONFIG;
    const bad = {
      ...c,
      pvp: {
        ...c.pvp,
        botGear: [
          { fromLevel: 10, rarity: 3 },
          { fromLevel: 5, rarity: 17 },
        ],
      },
    };
    expect(validateGameConfig(bad).join(' ')).toContain('Bot-Ausrüstung');
    expect(validateGameConfig(c)).toEqual([]);
  });
});
