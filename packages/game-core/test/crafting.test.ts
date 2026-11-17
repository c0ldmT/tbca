import { describe, expect, it } from 'vitest';

import {
  CraftingError,
  DEFAULT_GAME_CONFIG as config,
  effectiveItem,
  equipmentBonus,
  itemValue,
  rerollAffix,
  rollItem,
  salvageYield,
  transferAffix,
  transferCost,
  upgradeCost,
  upgradeItem,
  Xoshiro128ss,
  type ItemData,
} from '../src/index.js';

const vest = (rarity = 5, level = 20, seed: string | number = 'v'): ItemData =>
  rollItem(config, { templateId: 'vest', itemLevel: level, rarity, seed });

describe('Zerlegen', () => {
  it('gibt Materialien nach Tier und Level', () => {
    expect(salvageYield(config, vest(1, 5))).toEqual({ scrap: 1 });
    expect(salvageYield(config, vest(8, 30))).toEqual({ scrap: 4, circuits: 2 });
    expect(salvageYield(config, vest(14, 100))).toEqual({
      scrap: 11,
      circuits: 5,
      quantum_cores: 3,
    });
  });
});

describe('Aufwerten', () => {
  it('erhöht alle Werte um 3 % je Stufe', () => {
    const item = { ...vest(), upgrade: 10 };
    const plain = vest();
    const eff = effectiveItem(config, item);
    expect(eff.base.armor).toBe(Math.floor((plain.base.armor! * 1300) / 1000));
    expect(itemValue(config, item)).toBeGreaterThan(itemValue(config, plain));
    expect(equipmentBonus(config, { torso: item }).stats.armor).toBeGreaterThan(
      equipmentBonus(config, { torso: plain }).stats.armor,
    );
  });

  it('gelingt bis +5 immer, kann ab +6 scheitern und senkt dann um eine Stufe', () => {
    const rng = Xoshiro128ss.fromSeed('upgrade');
    let item = vest();
    for (let i = 1; i <= 5; i++) {
      const r = upgradeItem(config, item, rng);
      expect(r.success).toBe(true);
      item = r.item;
    }
    expect(item.upgrade).toBe(5);
    expect(upgradeCost(config, item)).toMatchObject({
      successPermille: 700,
      materials: { circuits: 4 },
    });
    const outcomes = Array.from({ length: 200 }, () => upgradeItem(config, item, rng).item.upgrade);
    expect(new Set(outcomes)).toEqual(new Set([4, 6]));
    expect(() => upgradeCost(config, { ...item, upgrade: 10 })).toThrow(CraftingError);
  });
});

describe('Affix-Übertragung und Neu würfeln', () => {
  const donor = rollItem(config, { templateId: 'boots', itemLevel: 20, rarity: 8, seed: 'donor' });

  it('überträgt einen Affix mit gleicher Qualität oder lässt das Ziel unverändert', () => {
    const target = { ...vest(2, 20, 'target'), affixes: [] };
    const stat = donor.affixes.find((a) => a.stat !== 'initiative')!.stat;
    const results = Array.from({ length: 50 }, (_, i) =>
      transferAffix(config, target, donor, stat, Xoshiro128ss.fromSeed(i)),
    );
    const ok = results.filter((r) => r.success);
    expect(ok.length).toBeGreaterThan(30); // 90 % bei 0 Affixen
    expect(ok[0]!.item.affixes).toHaveLength(1);
    for (const r of results.filter((x) => !x.success)) expect(r.item).toBe(target);
    expect(
      transferCost(config, { ...target, affixes: donor.affixes.slice(0, 2) }).successPermille,
    ).toBe(500);
  });

  it('lehnt unpassende Übertragungen ab', () => {
    const rng = Xoshiro128ss.fromSeed(1);
    const target = vest(2, 20, 'target');
    expect(() => transferAffix(config, target, donor, 'damageDealt', rng)).toThrow(/Spender|passt/);
    const withStat = { ...target, affixes: [donor.affixes[0]!] };
    expect(() => transferAffix(config, withStat, donor, donor.affixes[0]!.stat, rng)).toThrow(
      /schon/,
    );
  });

  it('würfelt einen Affix neu, ohne Doppelte zu erzeugen', () => {
    const item = vest(8, 20, 'reroll');
    const stat = item.affixes[0]!.stat;
    for (let i = 0; i < 30; i++) {
      const next = rerollAffix(config, item, stat, Xoshiro128ss.fromSeed(i));
      expect(next.affixes).toHaveLength(item.affixes.length);
      expect(new Set(next.affixes.map((a) => a.stat)).size).toBe(item.affixes.length);
    }
    expect(() => rerollAffix(config, item, 'damageDealt', Xoshiro128ss.fromSeed(1))).toThrow(
      CraftingError,
    );
  });
});
