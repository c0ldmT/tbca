import { DEFAULT_GAME_CONFIG, defaultLoadout } from '@tbca/game-core';
import { describe, expect, it } from 'vitest';

import { MemoryRateLimiter } from '../src/limits/rate-limiter.js';
import { ProgressionService } from '../src/progression/progression.service.js';
import { InMemoryCharacters } from './helpers.js';

function setup(levels: number[]) {
  const characters = new InMemoryCharacters();
  levels.forEach((level, i) =>
    characters.records.push({
      id: `c${i}`,
      accountId: `a${i}`,
      seasonId: 's1',
      name: `Spieler${i}`,
      classId: 'bruiser',
      level,
      xp: 0,
      allocated: { str: 0, dex: 0, int: 0, con: 0 },
      loadouts: { bruiser: defaultLoadout(DEFAULT_GAME_CONFIG, 'bruiser', 1) },
    } as never),
  );
  return { characters, service: new ProgressionService(characters, new MemoryRateLimiter()) };
}

describe('ProgressionService', () => {
  it('berechnet den Median einmal und liest ihn danach aus dem Zwischenspeicher', async () => {
    const { characters, service } = setup([10, 20, 30]);
    expect(await service.median('s1')).toBe(20);
    characters.records.length = 0;
    expect(await service.median('s1')).toBe(20);
    expect(await service.refreshMedian('s1')).toBe(0);
  });

  it('gibt den Aufholbonus nur weit unter dem Median', async () => {
    const { service } = setup([30, 30, 30]);
    const median = await service.median('s1');
    expect(service.boost(DEFAULT_GAME_CONFIG, { xp: 100, credits: 5 }, 10, median)).toEqual({
      xp: 150,
      credits: 5,
    });
    expect(service.boost(DEFAULT_GAME_CONFIG, { xp: 100 }, 26, median).xp).toBe(100);
  });
});
