import { describe, expect, it } from 'vitest';

import {
  CLASS_SILHOUETTES,
  TEMPLATE_GLYPHS,
  circuitTrace,
  itemGlyph,
  silhouetteFor,
  UNKNOWN_SILHOUETTE,
} from '../src/index.js';

const SLOTS = [
  'head',
  'torso',
  'legs',
  'feet',
  'hands',
  'main_hand',
  'off_hand',
  'implant_1',
  'implant_2',
  'core_implant',
];

describe('Item-Icons', () => {
  it('liefert für jede Startvorlage eine Glyphe und fällt auf die Kategorie zurück', () => {
    for (const id of ['blade', 'rifle', 'cyberdeck', 'vest', 'implant', 'core_implant']) {
      expect(itemGlyph(id)).toBe(TEMPLATE_GLYPHS[id]);
    }
    expect(itemGlyph('eigene_vorlage', 'weapon_2h')).toBe(TEMPLATE_GLYPHS['rifle']);
    expect(itemGlyph('eigene_vorlage')).toBe(TEMPLATE_GLYPHS['implant']);
  });

  it('erzeugt Leiterbahnen deterministisch aus der Item-ID', () => {
    const a = circuitTrace('3f2a6c4e-0000-4000-8000-000000000001');
    expect(circuitTrace('3f2a6c4e-0000-4000-8000-000000000001')).toBe(a);
    expect(circuitTrace('3f2a6c4e-0000-4000-8000-000000000002')).not.toBe(a);
    expect(a.match(/M/g)).toHaveLength(6);
    // Alle Punkte bleiben in der 48×48-Fläche.
    for (const [, x, y] of a.matchAll(/M(-?\d+) (-?\d+)/g)) {
      for (const n of [Number(x), Number(y)]) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(48);
      }
    }
  });
});

describe('Silhouetten', () => {
  it('haben für jede Klasse alle zehn Knotenpunkte innerhalb der Fläche', () => {
    for (const [cls, s] of Object.entries(CLASS_SILHOUETTES)) {
      expect(Object.keys(s.nodes).sort(), cls).toEqual([...SLOTS].sort());
      for (const [x, y] of Object.values(s.nodes)) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(200);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(440);
      }
      expect(s.body.length).toBeGreaterThan(5);
    }
  });

  it('nutzt für unbekannte Gegner eine neutrale Form', () => {
    expect(silhouetteFor('netrunner')).toBe(CLASS_SILHOUETTES.netrunner);
    expect(silhouetteFor(null)).toBe(UNKNOWN_SILHOUETTE);
    expect(silhouetteFor('drone')).toBe(UNKNOWN_SILHOUETTE);
  });
});
