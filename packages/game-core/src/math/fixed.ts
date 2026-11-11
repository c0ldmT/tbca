/**
 * Festkomma-Arithmetik für die Spiellogik.
 *
 * Werte werden als ganze Zahlen mit dem Faktor FP_SCALE gespeichert:
 * 1,0 = 10 000, 0,85 = 8 500, 1,5 = 15 000. Alle Operationen sind exakt bzw.
 * runden nach einer festen Regel, damit jede JavaScript-Engine dasselbe
 * Ergebnis liefert. Funktionen wie Math.pow, Math.exp oder Math.log sind in
 * der Simulation tabu (Spezifikation, Abschnitt 6).
 */

/** Ein Festkommawert (ganze Zahl, skaliert mit FP_SCALE). */
export type Fixed = number;

export const FP_SCALE = 10_000;
export const FP_ONE: Fixed = FP_SCALE;

function assertSafe(value: number, what: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${what} verlässt den sicheren Ganzzahlbereich: ${value}`);
  }
  return value;
}

/**
 * Ganzzahlige Division mit Rundung „halb von 0 weg“.
 * Exakt für alle sicheren Ganzzahlen, unabhängig von Gleitkomma-Details.
 */
export function roundDiv(numerator: number, denominator: number): number {
  assertSafe(numerator, 'Zähler');
  assertSafe(denominator, 'Nenner');
  if (denominator === 0) throw new RangeError('Division durch 0');

  const negative = numerator < 0 !== denominator < 0;
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);

  let q = Math.trunc(n / d);
  let r = n - q * d;
  // Korrektur, falls die Gleitkomma-Division um 1 danebenliegt.
  if (r < 0) {
    q -= 1;
    r += d;
  } else if (r >= d) {
    q += 1;
    r -= d;
  }
  if (r * 2 >= d) q += 1;
  return negative && q !== 0 ? -q : q;
}

/** Ganze Zahl → Festkomma. */
export function fp(value: number): Fixed {
  return assertSafe(value * FP_SCALE, 'Festkommawert');
}

/** Bruch → Festkomma, z. B. ratio(85, 100) = 0,85. */
export function ratio(numerator: number, denominator: number): Fixed {
  return roundDiv(assertSafe(numerator * FP_SCALE, 'Zähler'), denominator);
}

/** Produkt zweier Festkommawerte. */
export function fpMul(a: Fixed, b: Fixed): Fixed {
  return roundDiv(assertSafe(a * b, 'Produkt'), FP_SCALE);
}

/** Quotient zweier Festkommawerte. */
export function fpDiv(a: Fixed, b: Fixed): Fixed {
  return roundDiv(assertSafe(a * FP_SCALE, 'Zähler'), b);
}

/** Festkomma → gerundete ganze Zahl. */
export function fpRound(value: Fixed): number {
  return roundDiv(value, FP_SCALE);
}

/** Festkomma → Gleitkommazahl, nur für Anzeige und Logs, nie für Spiellogik. */
export function fpToNumber(value: Fixed): number {
  return value / FP_SCALE;
}

/** Begrenzt einen Wert auf [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
