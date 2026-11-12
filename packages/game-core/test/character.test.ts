import { describe, expect, it } from 'vitest';

import {
  availableAbilities,
  BuildError,
  CLASS_IDS,
  DEFAULT_GAME_CONFIG as config,
  defaultLoadout,
  deriveSnapshot,
  levelFromXp,
  pointsForLevel,
  respecCost,
  totalXpForLevel,
  unspentPoints,
  validateBuild,
  xpToNext,
  type CharacterBuild,
} from '../src/index.js';

const build = (patch: Partial<CharacterBuild> = {}): CharacterBuild => ({
  id: 'c1',
  name: 'Kira',
  level: 1,
  classId: 'bruiser',
  allocated: { str: 3, dex: 0, int: 0, con: 2 },
  loadout: defaultLoadout(config, 'bruiser', 1),
  ...patch,
});

describe('Standardkonfiguration', () => {
  it('hat eindeutige Fähigkeiten und gültige Standard-Taktiken je Klasse', () => {
    const ids = config.abilities.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const classId of CLASS_IDS) {
      const own = config.abilities.filter((a) => a.classId === classId);
      expect(own.length).toBeGreaterThanOrEqual(3);
      for (const rule of config.classes[classId].defaultTactics) {
        expect(own.map((a) => a.id)).toContain(rule.use);
      }
      // Auf jedem Level ergibt das Standard-Loadout einen gültigen Build.
      for (const level of [1, 5, 10, 50, 100]) {
        const allocated = { str: 0, dex: 0, int: 0, con: 0 };
        expect(() =>
          validateBuild(config, {
            ...build(),
            classId,
            level,
            allocated,
            loadout: defaultLoadout(config, classId, level),
          }),
        ).not.toThrow();
      }
    }
  });

  it('ist JSON-serialisierbar (für config_version.data)', () => {
    expect(JSON.parse(JSON.stringify(config))).toEqual(config);
  });
});

describe('Attributspunkte', () => {
  it('gibt 5 Punkte pro Level und berechnet die Umskill-Kosten', () => {
    expect(pointsForLevel(config, 1)).toBe(5);
    expect(pointsForLevel(config, 20)).toBe(100);
    expect(unspentPoints(config, 2, { str: 3, dex: 0, int: 0, con: 2 })).toBe(5);
    expect(respecCost(config, 30)).toBe(300);
  });

  it('lehnt zu viele oder negative Punkte ab', () => {
    expect(() =>
      validateBuild(config, build({ allocated: { str: 6, dex: 0, int: 0, con: 0 } })),
    ).toThrow(expect.objectContaining({ code: 'too_many_points' }));
    expect(() =>
      validateBuild(config, build({ allocated: { str: -1, dex: 0, int: 0, con: 0 } })),
    ).toThrow(BuildError);
    expect(() => validateBuild(config, build({ level: 101 }))).toThrow(
      expect.objectContaining({ code: 'invalid_level' }),
    );
  });
});

describe('Loadout', () => {
  it('schaltet Fähigkeiten mit dem Level frei', () => {
    expect(availableAbilities(config, 'bruiser', 1).map((a) => a.id)).toEqual([
      'bruiser.heavy_strike',
      'bruiser.provoke',
    ]);
    expect(availableAbilities(config, 'bruiser', 10)).toHaveLength(4);
  });

  it('prüft Fähigkeiten und Taktikregeln', () => {
    const loadout = (abilities: string[], tactics: CharacterBuild['loadout']['tactics'] = []) =>
      build({ loadout: { abilities, tactics } });
    expect(() => validateBuild(config, loadout(['gunner.double_tap']))).toThrow(
      expect.objectContaining({ code: 'unknown_ability' }),
    );
    expect(() => validateBuild(config, loadout(['bruiser.shockwave']))).toThrow(
      expect.objectContaining({ code: 'ability_locked' }),
    );
    expect(() => validateBuild(config, loadout(['bruiser.provoke', 'bruiser.provoke']))).toThrow(
      expect.objectContaining({ code: 'duplicate_ability' }),
    );
    expect(() =>
      validateBuild(
        config,
        loadout(['bruiser.provoke'], [{ when: { type: 'always' }, use: 'bruiser.heavy_strike' }]),
      ),
    ).toThrow(expect.objectContaining({ code: 'rule_not_in_loadout' }));
    const sevenRules = Array.from({ length: 7 }, () => ({
      when: { type: 'always' as const },
      use: 'basic_attack',
    }));
    expect(() => validateBuild(config, loadout([], sevenRules))).toThrow(
      expect.objectContaining({ code: 'too_many_rules' }),
    );
  });
});

describe('deriveSnapshot', () => {
  it('leitet Kampfwerte aus Attributen, Klasse und Level ab', () => {
    const s = deriveSnapshot(config, build());
    // Basis 5 + freie Punkte; auf Level 1 noch kein Klassen-Zuwachs.
    expect(s.attributes).toEqual({ str: 8, dex: 5, int: 5, con: 7 });
    expect(s.stats.maxHp).toBe(120 + 12 + 70);
    expect(s.stats.energyStart).toBe(50);
    expect(s.attack).toEqual({ kind: 'physical', base: 18, attribute: 8, scaling: 9_000 });
    expect(s.modifiers).toEqual({ damageTaken: -1_000 });
    expect(s.abilities.map((a) => a.id)).toEqual(['bruiser.heavy_strike', 'bruiser.provoke']);
  });

  it('wächst mit dem Level um den festen Klassen-Zuwachs', () => {
    const s = deriveSnapshot(config, build({ level: 11 }));
    expect(s.attributes.str).toBe(5 + 2 * 10 + 3);
    expect(s.attributes.con).toBe(5 + 1 * 10 + 2);
  });
});

describe('XP-Kurve', () => {
  it('wächst quadratisch und erreicht Level 100 bei rund 1,1 Mio. XP', () => {
    expect(xpToNext(config, 1)).toBe(128);
    expect(totalXpForLevel(config, 1)).toBe(0);
    expect(totalXpForLevel(config, 100)).toBe(1_118_700);
  });

  it('rechnet XP in Level und Fortschritt um', () => {
    expect(levelFromXp(config, 0)).toEqual({ level: 1, intoLevel: 0, toNext: 128 });
    expect(levelFromXp(config, 130)).toEqual({
      level: 2,
      intoLevel: 2,
      toNext: xpToNext(config, 2),
    });
    expect(levelFromXp(config, 5_000_000)).toEqual({ level: 100, intoLevel: 0, toNext: null });
  });
});
