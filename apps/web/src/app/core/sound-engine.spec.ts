import { RECIPES, dropRecipe, type Voice } from './sound-engine';

const all: [string, Voice[]][] = [
  ...Object.entries(RECIPES),
  ...[1, 2, 3, 4, 5, 6].map((t): [string, Voice[]] => [`drop${t}`, dropRecipe(t)]),
];

describe('Klangrezepte', () => {
  it.each(all)('%s hat gültige, leise Stimmen', (_id, voices) => {
    expect(voices.length).toBeGreaterThan(0);
    for (const v of voices) {
      expect(v.len).toBeGreaterThan(0);
      expect(v.vol).toBeGreaterThan(0);
      expect(v.vol).toBeLessThanOrEqual(0.1);
      expect(v.attack ?? 0.005).toBeLessThan(v.len);
      if (v.wave !== 'noise') expect(Math.min(v.from, v.to)).toBeGreaterThan(20);
      if (v.filter) expect(Math.min(v.filter.from, v.filter.to)).toBeGreaterThan(20);
      expect(Math.abs(v.pan ?? 0)).toBeLessThanOrEqual(1);
      expect(v.send ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('UI-Klänge bleiben kurz', () => {
    for (const id of ['press', 'toggle', 'select', 'tab', 'open', 'close'] as const) {
      const end = Math.max(...RECIPES[id].map((v) => (v.delay ?? 0) + v.len));
      expect(end, id).toBeLessThanOrEqual(0.25);
    }
  });

  it('Drops werden mit dem Tier reicher', () => {
    expect(dropRecipe(6).length).toBeGreaterThan(dropRecipe(3).length);
    expect(dropRecipe(3).length).toBeGreaterThan(dropRecipe(1).length);
  });
});
