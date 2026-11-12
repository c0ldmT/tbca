import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GAME_CONFIG,
  exportItems,
  generateTemplate,
  importItems,
  ITEM_EXCHANGE_FORMAT,
  slug,
  stylesFor,
  templateCurve,
  templateCurveSummary,
  toPercent,
  uniqueId,
  validateGameConfig,
  type GameConfig,
  type ItemTemplate,
} from '../src/index.js';

const config = DEFAULT_GAME_CONFIG;
const find = (id: string) => config.items.templates.find((t) => t.id === id)!;

describe('Kurven-Abgleich', () => {
  it('liegt für Vorlagen mit vollem Pool und Referenz-Skalierung bei etwa 1000 ‰', () => {
    expect(templateCurveSummary(config, find('blade')).ratioPermille).toBeGreaterThan(980);
    expect(templateCurveSummary(config, find('implant')).ratioPermille).toBe(1000);
  });

  it('bewertet höhere Skalierung und kleine Affix-Pools', () => {
    const club = templateCurve(config, find('club'), 30, 6);
    expect(club.parts.scaling).toBeGreaterThan(0);
    expect(club.ratioPermille).toBeGreaterThan(1050);
    const thin: ItemTemplate = { ...find('vest'), affixPool: ['con'] };
    expect(templateCurve(config, thin, 60, 9).ratioPermille).toBeLessThan(850);
  });
});

describe('Item-Generator', () => {
  it('ist deterministisch, benennt DE/EN und vergibt eine freie ID', () => {
    const a = generateTemplate(config, { category: 'torso', style: 'bulwark', seed: 's1' });
    const b = generateTemplate(config, { category: 'torso', style: 'bulwark', seed: 's1' });
    expect(a).toEqual(b);
    expect(a.template.names?.de).toMatch(/-/);
    expect(a.template.names?.en).toBeTruthy();
    expect(a.template.id).toBe(slug(a.template.names!.en!));
    expect(config.items.templates.some((t) => t.id === a.template.id)).toBe(false);
  });

  it('erzeugt für jede Kategorie und jeden Stil gültige Vorlagen nahe der Kurve', () => {
    const categories = [
      'head',
      'torso',
      'legs',
      'feet',
      'hands',
      'shield',
      'weapon_1h',
      'weapon_2h',
      'implant',
      'core_implant',
    ] as const;
    let game: GameConfig = config;
    for (const category of categories) {
      for (const style of stylesFor(category)) {
        const g = generateTemplate(game, { category, style, seed: `${category}:${style}` });
        expect(g.ratioPermille, `${category}/${style}`).toBeGreaterThanOrEqual(950);
        expect(g.ratioPermille, `${category}/${style}`).toBeLessThanOrEqual(1050);
        game = {
          ...game,
          items: { ...game.items, templates: [...game.items.templates, g.template] },
        };
      }
    }
    expect(validateGameConfig(game)).toEqual([]);
  });

  it('bildet IDs nur aus erlaubten Zeichen', () => {
    expect(slug('Präzisions-Gewehr Ü2')).toBe('prazisions_gewehr_u2');
    expect(slug('ß')).toBe('ss');
    expect(slug('x')).toBe('item_x');
    expect(uniqueId(config, 'blade')).toBe('blade_2');
  });
});

describe('Austauschformat tbca-items/v1', () => {
  it('normiert Gewichte auf Prozent und Skalierung je Attributpunkt', () => {
    expect(toPercent({ armor: 2, firewall: 1 })).toEqual({ armor: 67, firewall: 33 });
    expect(toPercent({ a: 1, b: 1, c: 1 })).toEqual({ a: 34, b: 33, c: 33 });
    const doc = exportItems(config, { configVersion: 4 });
    expect(doc.format).toBe(ITEM_EXCHANGE_FORMAT);
    const club = doc.templates.find((t) => t.id === 'club')!;
    expect(club.weapon?.perPoint).toBe(1);
    expect(Object.keys(club.curve!)).toEqual(['L10★3', 'L30★6', 'L60★9']);
  });

  it('übernimmt einen Export ohne Änderungen unverändert', () => {
    const doc = JSON.parse(JSON.stringify(exportItems(config)));
    const result = importItems(config, doc, { mode: 'replace', withRules: true });
    expect(result).toMatchObject({ added: [], changed: [], removed: [], problems: [] });
    expect(result.game.items.templates).toEqual(config.items.templates);
  });

  it('meldet neue, geänderte und entfernte Vorlagen und prüft das Ergebnis', () => {
    const doc = JSON.parse(JSON.stringify(exportItems(config)));
    doc.templates = doc.templates.filter((t: { id: string }) => t.id !== 'club');
    doc.templates.find((t: { id: string }) => t.id === 'pistol').weapon.perPoint = 0.95;
    doc.templates.push({
      id: 'katana',
      names: { de: 'Katana', en: 'Katana' },
      category: 'weapon_2h',
      weapon: { kind: 'physical', scalesWith: 'dex', perPoint: 0.95 },
      base: { weaponDamage: 100 },
      affixPool: ['dex', 'critChance'],
    });
    const replace = importItems(config, doc, { mode: 'replace', withRules: false });
    expect(replace).toMatchObject({ added: ['katana'], changed: ['pistol'], removed: ['club'] });
    expect(replace.problems).toEqual([]);
    expect(replace.game.items.templates.find((t) => t.id === 'pistol')!.weapon!.scaling).toBe(
      9_500,
    );
    const merge = importItems(config, doc, { mode: 'merge', withRules: false });
    expect(merge.removed).toEqual([]);
    expect(merge.game.items.templates.some((t) => t.id === 'club')).toBe(true);

    expect(
      importItems(config, { format: 'x' }, { mode: 'merge', withRules: false }).problems,
    ).toHaveLength(1);
    doc.templates.push({ id: 'Bad Id', category: 'torso', base: { armor: -1 }, affixPool: [] });
    expect(
      importItems(config, doc, { mode: 'merge', withRules: false }).problems.length,
    ).toBeGreaterThan(0);
  });
});
