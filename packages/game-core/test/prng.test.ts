import { describe, expect, it } from 'vitest';

import { Xoshiro128ss } from '../src/index.js';

describe('Xoshiro128ss', () => {
  it('entspricht der C-Referenzimplementierung von Blackman & Vigna', () => {
    // Referenzwerte aus xoshiro128starstar.c mit dem Zustand {1, 2, 3, 4}.
    const rng = Xoshiro128ss.fromState([1, 2, 3, 4]);
    const values = Array.from({ length: 8 }, () => rng.nextUint32());
    expect(values).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849,
    ]);

    const rng2 = Xoshiro128ss.fromState([0x9e3779b9, 0x243f6a88, 0xb7e15162, 0xdeadbeef]);
    expect(Array.from({ length: 4 }, () => rng2.nextUint32())).toEqual([
      2463954730, 5524658, 74256371, 1905451993,
    ]);
  });

  it('liefert für denselben Seed dieselbe Folge', () => {
    const a = Xoshiro128ss.fromSeed('season-1:fight-42');
    const b = Xoshiro128ss.fromSeed('season-1:fight-42');
    for (let i = 0; i < 1000; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('liefert für verschiedene Seeds verschiedene Folgen', () => {
    const a = Xoshiro128ss.fromSeed(1);
    const b = Xoshiro128ss.fromSeed(2);
    const seqA = Array.from({ length: 8 }, () => a.nextUint32());
    const seqB = Array.from({ length: 8 }, () => b.nextUint32());
    expect(seqA).not.toEqual(seqB);
  });

  it('setzt einen gespeicherten Zustand exakt fort', () => {
    const rng = Xoshiro128ss.fromSeed('checkpoint');
    for (let i = 0; i < 17; i++) rng.nextUint32();
    const copy = Xoshiro128ss.fromState(rng.getState());
    const clone = rng.clone();
    const expected = Array.from({ length: 50 }, () => rng.nextUint32());
    expect(Array.from({ length: 50 }, () => copy.nextUint32())).toEqual(expected);
    expect(Array.from({ length: 50 }, () => clone.nextUint32())).toEqual(expected);
  });

  it('bleibt bei nextInt und nextRange in den Grenzen', () => {
    const rng = Xoshiro128ss.fromSeed('bounds');
    for (let i = 0; i < 10_000; i++) {
      const n = rng.nextInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
      const r = rng.nextRange(-3, 3);
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThanOrEqual(3);
    }
    expect(rng.nextInt(1)).toBe(0);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(1.5)).toThrow(RangeError);
    expect(() => rng.nextRange(5, 4)).toThrow(RangeError);
  });

  it('verteilt nextInt annähernd gleichmäßig', () => {
    const rng = Xoshiro128ss.fromSeed('uniform');
    const buckets = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) buckets[rng.nextInt(10)]!++;
    for (const count of buckets) {
      expect(Math.abs(count - n / 10)).toBeLessThan(n / 100); // ±10 % je Eimer
    }
  });

  it('chance verbraucht immer genau einen Wert und respektiert die Grenzen', () => {
    const a = Xoshiro128ss.fromSeed('chance');
    const b = Xoshiro128ss.fromSeed('chance');
    expect(a.chance(0, 100)).toBe(false);
    expect(a.chance(100, 100)).toBe(true);
    b.nextUint32();
    b.nextUint32();
    expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('lehnt einen Nullzustand und ungültige Seeds ab', () => {
    expect(() => Xoshiro128ss.fromState([0, 0, 0, 0])).toThrow(RangeError);
    expect(() => Xoshiro128ss.fromSeed(1.5)).toThrow(RangeError);
  });
});
