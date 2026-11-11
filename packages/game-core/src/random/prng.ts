import { fnv1a32 } from '../util/hash.js';

/** Interner Zustand des PRNG: vier vorzeichenlose 32-Bit-Wörter. */
export type PrngState = readonly [number, number, number, number];

/** Seed als Zahl (wird als uint32 interpretiert) oder als beliebiger String. */
export type Seed = number | string;

const UINT32_RANGE = 0x1_0000_0000;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** SplitMix32: verteilt einen 32-Bit-Seed auf gut gemischte Startwerte. */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

function seedToUint32(seed: Seed): number {
  if (typeof seed === 'number') {
    if (!Number.isSafeInteger(seed)) {
      throw new RangeError(`Seed muss eine ganze Zahl sein, erhalten: ${seed}`);
    }
    return seed >>> 0;
  }
  return fnv1a32(seed);
}

/**
 * xoshiro128** (Blackman & Vigna) – schneller, deterministischer PRNG mit 128 Bit Zustand.
 * Einzige Zufallsquelle der Spiellogik; Math.random ist tabu.
 *
 * Alle Operationen sind reine 32-Bit-Ganzzahlarithmetik und liefern in jeder
 * JavaScript-Engine identische Folgen.
 */
export class Xoshiro128ss {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  private constructor(state: PrngState) {
    this.s0 = state[0] >>> 0;
    this.s1 = state[1] >>> 0;
    this.s2 = state[2] >>> 0;
    this.s3 = state[3] >>> 0;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) {
      throw new RangeError('PRNG-Zustand darf nicht vollständig 0 sein');
    }
  }

  /** Erzeugt einen PRNG aus einem Seed (Zahl oder String). */
  static fromSeed(seed: Seed): Xoshiro128ss {
    const next = splitmix32(seedToUint32(seed));
    return new Xoshiro128ss([next(), next(), next(), next()]);
  }

  /** Stellt einen PRNG aus einem gespeicherten Zustand wieder her. */
  static fromState(state: PrngState): Xoshiro128ss {
    return new Xoshiro128ss(state);
  }

  /** Aktueller Zustand, z. B. für Zwischenstände. */
  getState(): PrngState {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  /** Unabhängige Kopie mit identischem Zustand. */
  clone(): Xoshiro128ss {
    return Xoshiro128ss.fromState(this.getState());
  }

  /** Nächste Zufallszahl als uint32 im Bereich [0, 2^32). */
  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;

    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);

    return result;
  }

  /**
   * Gleichverteilte ganze Zahl in [0, bound) ohne Modulo-Verzerrung
   * (Verwerfungsverfahren). `bound` muss in (0, 2^32] liegen.
   */
  nextInt(bound: number): number {
    if (!Number.isSafeInteger(bound) || bound <= 0 || bound > UINT32_RANGE) {
      throw new RangeError(`bound muss eine ganze Zahl in (0, 2^32] sein, erhalten: ${bound}`);
    }
    // Größtes Vielfaches von bound bis 2^32; Werte darüber werden verworfen.
    const limit = UINT32_RANGE - (UINT32_RANGE % bound);
    let x = this.nextUint32();
    while (x >= limit) x = this.nextUint32();
    return x % bound;
  }

  /** Gleichverteilte ganze Zahl in [min, max] (beide inklusive). */
  nextRange(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
      throw new RangeError(`Ungültiger Bereich [${min}, ${max}]`);
    }
    return min + this.nextInt(max - min + 1);
  }

  /**
   * true mit Wahrscheinlichkeit numerator / denominator (ganzzahlig, exakt).
   * Verbraucht immer genau einen Zufallswert, damit die Folge nicht vom Ergebnis abhängt.
   */
  chance(numerator: number, denominator: number): boolean {
    return this.nextInt(denominator) < numerator;
  }
}
