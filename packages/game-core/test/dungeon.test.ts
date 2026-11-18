import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GAME_CONFIG as config,
  dungeonFee,
  ENGINE_VERSION,
  floorReward,
  maxRarityAt,
  monsterLevel,
  planFloor,
  regenerate,
  simulateBattle,
} from '../src/index.js';
import { hero, tweak } from './fixtures.js';

const rules = config.dungeon;

describe('Dungeon', () => {
  it('startet knapp unter dem Charakterlevel und steigt je Etage um 1', () => {
    expect(monsterLevel(rules, 10, 1)).toBe(8);
    expect(monsterLevel(rules, 10, 6)).toBe(13);
    expect(monsterLevel(rules, 1, 1)).toBe(1);
    expect(dungeonFee(rules, 20)).toBe(45);
  });

  it('plant Etagen reproduzierbar mit Bossen, Modifikatoren und mehr Gegnern in der Tiefe', () => {
    const plan = (floor: number) =>
      planFloor(config, { characterLevel: 10, floor, seed: `run:${floor}` });
    expect(plan(3)).toEqual(plan(3));
    expect(plan(3)).toMatchObject({ boss: false, modifiers: [] });
    expect(plan(3).enemies).toHaveLength(1);
    const boss = plan(5);
    expect(boss.boss).toBe(true);
    expect(boss.enemies).toHaveLength(1);
    expect(boss.enemies[0]!.name).toBe('warden');
    expect(plan(12).modifiers.length).toBeGreaterThanOrEqual(1);
    expect(plan(12).enemies).toHaveLength(2);
    for (const e of plan(12).enemies) expect(e.classId).toBeNull();
  });

  it('macht Bosse deutlich stärker als normale Monster', () => {
    const boss = planFloor(config, { characterLevel: 10, floor: 5, seed: 'b' }).enemies[0]!;
    const normal = planFloor(config, { characterLevel: 10, floor: 4, seed: 'b' }).enemies[0]!;
    expect(boss.stats.maxHp).toBeGreaterThan(normal.stats.maxHp * 2);
  });

  it('erhöht die mögliche Rarität mit der Tiefe', () => {
    expect([1, 19, 20, 50, 75, 200].map((f) => maxRarityAt(rules, f))).toEqual([
      9, 9, 12, 15, 16, 16,
    ]);
    for (let i = 0; i < 50; i++) {
      const plan = planFloor(config, { characterLevel: 10, floor: 3, seed: i });
      for (const item of floorReward(config, { plan, seed: i }).items) {
        expect(item.rarity).toBeLessThanOrEqual(9);
        expect(item.itemLevel).toBe(plan.monsterLevel);
      }
    }
  });

  it('belohnt Boss-Etagen doppelt', () => {
    const normal = floorReward(config, {
      plan: planFloor(config, { characterLevel: 10, floor: 4, seed: 1 }),
      seed: 1,
    });
    const boss = floorReward(config, {
      plan: planFloor(config, { characterLevel: 10, floor: 5, seed: 1 }),
      seed: 1,
    });
    expect(normal.items).toHaveLength(1);
    expect(boss.items).toHaveLength(2);
    expect(boss.xp).toBe(2 * (20 + 10 * 12));
  });

  it('regeneriert 10 % zwischen den Etagen und startet Kämpfe mit dem gespeicherten Zustand', () => {
    expect(regenerate(rules, { hp: 50, energy: 95 }, { hp: 400, energy: 100 })).toEqual({
      hp: 90,
      energy: 100,
    });
    const me = tweak(hero('me', 'bruiser'), { state: { hp: 30, energy: 0 } });
    const plan = planFloor(config, { characterLevel: 10, floor: 1, seed: 's' });
    const result = simulateBattle({
      engineVersion: ENGINE_VERSION,
      configVersion: 1,
      seed: 's',
      teams: [[me], [...plan.enemies]],
    });
    const start = result.events[0]!;
    if (start.type !== 'start') throw new Error('start fehlt');
    expect(start.combatants[0]).toMatchObject({ id: 'me', hp: 30, energy: 0 });
    expect(() =>
      simulateBattle({
        engineVersion: ENGINE_VERSION,
        configVersion: 1,
        seed: 's',
        teams: [[tweak(me, { state: { hp: 0, energy: 0 } })], [...plan.enemies]],
      }),
    ).toThrow(/state.hp/);
  });
});
