import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GAME_CONFIG as config,
  defaultLoadout,
  deriveSnapshot,
  equipmentBonus,
  itemBudget,
  rarityFactor,
  rarityTier,
  rollItem,
  rollLoot,
  slotsFor,
  validateEquipment,
  Xoshiro128ss,
  rollRarity,
  type CharacterBuild,
} from '../src/index.js';

describe('Power-Budget', () => {
  it('folgt der Formel B · L · (1 + 0,35 · ln R)', () => {
    expect(rarityFactor(1)).toBe(10_000);
    expect(rarityFactor(9)).toBe(17_690);
    expect(rarityFactor(16)).toBe(19_704);
    expect(rarityFactor(1000)).toBe(rarityFactor(64)); // offen, mit abnehmendem Ertrag
    expect(itemBudget(config, 'weapon_1h', 50, 3)).toBe(Math.round(10 * 50 * 1.3845));
    // Item-Level dominiert: 9 Sterne auf Level 5 ≈ ein Achtel von 3 Sternen auf Level 50.
    const ratio = itemBudget(config, 'torso', 5, 9) / itemBudget(config, 'torso', 50, 3);
    expect(ratio).toBeGreaterThan(0.11);
    expect(ratio).toBeLessThan(0.14);
    expect([1, 3, 4, 9, 10, 16].map(rarityTier)).toEqual([1, 1, 2, 3, 4, 6]);
  });
});

describe('rollItem', () => {
  it('ist reproduzierbar und streut je Seed', () => {
    const input = { templateId: 'vest', itemLevel: 20, rarity: 7 };
    expect(rollItem(config, { ...input, seed: 'x' })).toEqual(
      rollItem(config, { ...input, seed: 'x' }),
    );
    const variants = new Set(
      Array.from({ length: 20 }, (_, i) =>
        JSON.stringify(rollItem(config, { ...input, seed: i }).affixes),
      ),
    );
    expect(variants.size).toBeGreaterThan(5);
  });

  it('würfelt Affix-Anzahl nach Tier und Werte innerhalb ihres Budgetanteils', () => {
    for (let i = 0; i < 200; i++) {
      for (const [rarity, min, max] of [
        [2, 0, 1],
        [5, 1, 2],
        [8, 2, 3],
        [11, 3, 4],
      ] as const) {
        const item = rollItem(config, {
          templateId: 'vest',
          itemLevel: 40,
          rarity,
          seed: `${rarity}-${i}`,
        });
        expect(item.affixes.length).toBeGreaterThanOrEqual(min);
        expect(item.affixes.length).toBeLessThanOrEqual(max);
        expect(new Set(item.affixes.map((a) => a.stat)).size).toBe(item.affixes.length);
        // Verbrauch liegt nie über dem Budget.
        const spent =
          Object.entries(item.base).reduce(
            (s, [k, v]) => s + v * config.items.statCost[k as 'armor'],
            0,
          ) + item.affixes.reduce((s, a) => s + a.value * config.items.statCost[a.stat], 0);
        expect(spent).toBeLessThanOrEqual(item.budget);
      }
    }
  });

  it('gibt Waffen Grundschaden und Implantaten mindestens einen Affix', () => {
    const rifle = rollItem(config, { templateId: 'rifle', itemLevel: 10, rarity: 1, seed: 1 });
    const pistol = rollItem(config, { templateId: 'pistol', itemLevel: 10, rarity: 1, seed: 1 });
    expect(rifle.base.weaponDamage).toBeGreaterThan(pistol.base.weaponDamage!);
    expect(
      rollItem(config, { templateId: 'implant', itemLevel: 1, rarity: 1, seed: 1 }).affixes,
    ).toHaveLength(1);
    expect(() =>
      rollItem(config, { templateId: 'laser', itemLevel: 1, rarity: 1, seed: 1 }),
    ).toThrow(/Vorlage/);
  });
});

describe('Ausrüstung', () => {
  const item = (templateId: string, rarity = 1, level = 10) =>
    rollItem(config, { templateId, itemLevel: level, rarity, seed: templateId });

  it('erlaubt Items nur in passenden Plätzen', () => {
    expect(slotsFor('weapon_1h')).toEqual(['main_hand', 'off_hand']);
    expect(() => validateEquipment({ head: item('boots') })).toThrow(/passt nicht/);
    expect(() => validateEquipment({ main_hand: item('rifle'), off_hand: item('shield') })).toThrow(
      /Zweihänder/,
    );
    expect(() =>
      validateEquipment({ main_hand: item('blade'), off_hand: item('club') }),
    ).not.toThrow();
  });

  it('nutzt die Haupthand-Waffe und addiert die halbe Nebenhand-Waffe', () => {
    const blade = item('blade');
    const club = item('club');
    const bonus = equipmentBonus(config, { main_hand: blade, off_hand: club });
    expect(bonus.attack).toMatchObject({ kind: 'physical', scalesWith: 'str', scaling: 9_000 });
    expect(bonus.attack!.base).toBe(
      blade.base.weaponDamage! + Math.round(club.base.weaponDamage! / 2),
    );
  });

  it('verändert die Kampfwerte der Momentaufnahme', () => {
    const build: CharacterBuild = {
      id: 'c',
      name: 'Kira',
      level: 10,
      classId: 'gunner',
      allocated: { str: 0, dex: 30, int: 0, con: 20 },
      loadout: defaultLoadout(config, 'gunner', 10),
    };
    const naked = deriveSnapshot(config, build);
    const geared = deriveSnapshot(config, {
      ...build,
      equipment: { main_hand: item('rifle', 5), torso: item('vest', 5), feet: item('boots', 5) },
    });
    expect(naked.attack.base).toBe(config.classes.gunner.starterWeapon.base);
    expect(geared.attack.base).toBeGreaterThan(naked.attack.base);
    expect(geared.stats.armor).toBeGreaterThan(naked.stats.armor);
  });
});

describe('Loot', () => {
  it('verteilt Raritäten nach den Gewichten und respektiert die Obergrenze', () => {
    const rng = Xoshiro128ss.fromSeed('loot');
    const counts = { low: 0, mid: 0, high: 0 };
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const r = rollRarity(config, rng, 9);
      expect(r).toBeLessThanOrEqual(9);
      if (r <= 3) counts.low++;
      else if (r <= 6) counts.mid++;
      else counts.high++;
    }
    expect(counts.low / n).toBeCloseTo(0.7, 1);
    expect(counts.mid / n).toBeCloseTo(0.25, 1);
    expect(counts.high / n).toBeGreaterThan(0.03);
  });

  it('würfelt ein vollständiges Item aus einem Seed', () => {
    const a = rollLoot(config, { itemLevel: 12, maxRarity: 9, seed: 'drop' });
    expect(a).toEqual(rollLoot(config, { itemLevel: 12, maxRarity: 9, seed: 'drop' }));
    expect(a.itemLevel).toBe(12);
  });
});
