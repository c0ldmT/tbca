import { describe, expect, it } from 'vitest';

import {
  BOT_NAMES,
  botBuild,
  CLASS_IDS,
  DEFAULT_GAME_CONFIG as config,
  deriveSnapshot,
  unspentPoints,
  validateBuild,
} from '../src/index.js';

describe('botBuild', () => {
  it('verteilt alle Punkte gültig und vorwiegend ins Hauptattribut', () => {
    for (const classId of CLASS_IDS) {
      for (const level of [1, 2, 7, 25, 100]) {
        const build = botBuild(config, {
          id: 'b',
          name: 'Echo',
          classId,
          level,
          seed: `${classId}-${level}`,
        });
        expect(() => validateBuild(config, build)).not.toThrow();
        expect(unspentPoints(config, level, build.allocated)).toBe(0);
        const primary = config.classes[classId].primary;
        expect(build.allocated[primary]).toBeGreaterThanOrEqual(Math.floor(level * 5 * 0.55));
        expect(() => deriveSnapshot(config, build)).not.toThrow();
      }
    }
  });

  it('ist reproduzierbar und streut je Seed', () => {
    const spec = { id: 'b', name: 'Echo', classId: 'gunner' as const, level: 30 };
    expect(botBuild(config, { ...spec, seed: 'a' })).toEqual(
      botBuild(config, { ...spec, seed: 'a' }),
    );
    const variants = new Set(
      Array.from({ length: 20 }, (_, i) =>
        JSON.stringify(botBuild(config, { ...spec, seed: i }).allocated),
      ),
    );
    expect(variants.size).toBeGreaterThan(3);
  });

  it('hat genug zulässige Namen', () => {
    expect(new Set(BOT_NAMES).size).toBe(BOT_NAMES.length);
    expect(BOT_NAMES.length).toBeGreaterThanOrEqual(16);
  });
});
