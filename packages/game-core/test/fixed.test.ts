import { describe, expect, it } from 'vitest';

import {
  clamp,
  fp,
  fpDiv,
  fpMul,
  fpRound,
  fpToNumber,
  FP_ONE,
  ratio,
  roundDiv,
} from '../src/index.js';

describe('Festkomma', () => {
  it('rundet halb von 0 weg', () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(-5, 2)).toBe(-3);
    expect(roundDiv(4, 3)).toBe(1);
    expect(roundDiv(5, 3)).toBe(2);
    expect(roundDiv(-4, 3)).toBe(-1);
    expect(roundDiv(7, -2)).toBe(-4);
    expect(roundDiv(1, 3)).toBe(0);
    expect(Object.is(roundDiv(-1, 3), 0)).toBe(true);
  });

  it('ist auch nahe der Grenze sicherer Ganzzahlen exakt', () => {
    const n = Number.MAX_SAFE_INTEGER;
    expect(roundDiv(n, 3)).toBe(3002399751580330);
    expect(roundDiv(n - 1, 2)).toBe(4503599627370495);
  });

  it('rechnet mit Festkommawerten', () => {
    expect(fp(3)).toBe(30_000);
    expect(ratio(85, 100)).toBe(8_500);
    expect(fpMul(fp(3), ratio(1, 2))).toBe(15_000);
    expect(fpDiv(fp(1), fp(3))).toBe(3_333);
    expect(fpRound(15_000)).toBe(2);
    expect(fpRound(14_999)).toBe(1);
    expect(fpToNumber(FP_ONE)).toBe(1);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });

  it('meldet Überläufe statt still ungenau zu rechnen', () => {
    expect(() => fpMul(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
    expect(() => roundDiv(1, 0)).toThrow(RangeError);
    expect(() => roundDiv(0.5, 1)).toThrow(RangeError);
  });
});
