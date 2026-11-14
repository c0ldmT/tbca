import { describe, expect, it } from 'vitest';

import { DEFAULT_GAME_CONFIG as config, pvpReward, type PvpRewardInput } from '../src/index.js';

const base: PvpRewardInput = {
  mode: 'rated',
  won: true,
  level: 20,
  opponentLevel: 20,
  rewardedToday: 0,
  rewardedVsOpponentToday: 0,
};

describe('pvpReward', () => {
  it('belohnt Siege nach Gegner-Level und Niederlagen mit einem Viertel', () => {
    expect(pvpReward(config, base)).toEqual({
      xp: 440,
      rewarded: true,
      factor: 1000,
      limit: 'none',
      underdogBonus: 0,
    });
    expect(pvpReward(config, { ...base, won: false }).xp).toBe(110);
  });

  it('gibt einen Underdog-Bonus gegen Stärkere, gedeckelt bei +50 %', () => {
    expect(pvpReward(config, { ...base, opponentLevel: 24 })).toMatchObject({
      underdogBonus: 200,
      factor: 1200,
      xp: 624,
    });
    expect(pvpReward(config, { ...base, opponentLevel: 40 }).underdogBonus).toBe(500);
    expect(pvpReward(config, { ...base, won: false, opponentLevel: 24 }).underdogBonus).toBe(0);
  });

  it('gibt nichts gegen deutlich Schwächere', () => {
    expect(pvpReward(config, { ...base, opponentLevel: 10 })).toMatchObject({
      xp: 40 + 200,
      rewarded: true,
    });
    expect(pvpReward(config, { ...base, opponentLevel: 9 })).toMatchObject({
      xp: 0,
      rewarded: false,
      limit: 'level_gap',
    });
  });

  it('nimmt gegen denselben Gegner ab: 100 %, 50 %, dann nichts', () => {
    expect(pvpReward(config, { ...base, rewardedVsOpponentToday: 1 })).toMatchObject({
      xp: 220,
      limit: 'same_opponent',
    });
    expect(pvpReward(config, { ...base, rewardedVsOpponentToday: 2 })).toMatchObject({
      xp: 0,
      rewarded: false,
    });
  });

  it('beachtet das Tageslimit und Freundschaftskämpfe', () => {
    expect(pvpReward(config, { ...base, rewardedToday: 9 }).rewarded).toBe(true);
    expect(pvpReward(config, { ...base, rewardedToday: 10 })).toMatchObject({
      rewarded: false,
      limit: 'daily_limit',
    });
    expect(pvpReward(config, { ...base, mode: 'friendly' })).toMatchObject({
      rewarded: false,
      limit: 'friendly',
    });
  });
});
