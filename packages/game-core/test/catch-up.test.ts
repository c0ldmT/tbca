import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GAME_CONFIG,
  catchUpActive,
  medianLevel,
  validateGameConfig,
  withCatchUp,
} from '../src/index.js';

describe('Aufholbonus', () => {
  it('berechnet den Median der Season', () => {
    expect(medianLevel([])).toBe(0);
    expect(medianLevel([5])).toBe(5);
    expect(medianLevel([30, 10, 20])).toBe(20);
    expect(medianLevel([10, 20, 30, 41])).toBe(25);
  });

  it('gilt erst ab mehr als 5 Level unter dem Median', () => {
    expect(catchUpActive(DEFAULT_GAME_CONFIG, 15, 20)).toBe(false);
    expect(catchUpActive(DEFAULT_GAME_CONFIG, 14, 20)).toBe(true);
    expect(catchUpActive(DEFAULT_GAME_CONFIG, 1, 0)).toBe(false);
  });

  it('gibt 50 % mehr XP, abgerundet', () => {
    expect(withCatchUp(DEFAULT_GAME_CONFIG, 181, 10, 30)).toBe(271);
    expect(withCatchUp(DEFAULT_GAME_CONFIG, 181, 28, 30)).toBe(181);
  });

  it('wird von der Konfigurationsprüfung erfasst', () => {
    expect(
      validateGameConfig({ ...DEFAULT_GAME_CONFIG, catchUp: { levelGap: -1, bonusPermille: 500 } }),
    ).toContain('Aufholbonus: Level-Abstand und Zuschlag müssen ganze Zahlen ≥ 0 sein');
  });
});
