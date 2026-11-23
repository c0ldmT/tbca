import { describe, expect, it } from 'vitest';

import { DEFAULT_GAME_CONFIG, validateGameConfig, type GameConfig } from '../src/index.js';

const clone = (): GameConfig => structuredClone(DEFAULT_GAME_CONFIG);

describe('validateGameConfig', () => {
  it('akzeptiert die Standardkonfiguration', () => {
    expect(validateGameConfig(DEFAULT_GAME_CONFIG)).toEqual([]);
  });

  it('meldet Fehler in Item-Vorlagen verständlich', () => {
    const c = clone();
    const templates = c.items.templates as unknown as Record<string, unknown>[];
    templates.push({ ...templates[0]!, id: 'blade' });
    templates.push({
      id: 'Laser!',
      category: 'weapon_1h',
      base: { weaponDamage: 1, mana: 2 },
      affixPool: ['luck'],
    });
    const problems = validateGameConfig(c);
    expect(problems).toContain('Vorlage blade: ID ist doppelt');
    expect(problems.some((p) => p.includes('nur aus a–z'))).toBe(true);
    expect(problems.some((p) => p.includes('Waffenwerte fehlen'))).toBe(true);
    expect(problems.some((p) => p.includes('unbekannter Basiswert mana'))).toBe(true);
    expect(problems.some((p) => p.includes('unbekannter Affix luck'))).toBe(true);
  });

  it('meldet fehlende Klassen und unbrauchbare Budgets', () => {
    const c = clone() as unknown as {
      classes: Record<string, unknown>;
      items: { categoryBudget: Record<string, number> };
    };
    delete c.classes['medtech'];
    c.items.categoryBudget['torso'] = 0;
    const problems = validateGameConfig(c as unknown as GameConfig);
    expect(problems).toContain('Klasse medtech fehlt');
    expect(problems.some((p) => p.includes('Budget der Kategorie torso'))).toBe(true);
  });
});
