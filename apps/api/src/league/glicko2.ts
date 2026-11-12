/**
 * Glicko-2 (Mark Glickman, „Example of the Glicko-2 system“, 2013). Jeder gewertete Kampf ist
 * eine eigene Bewertungsperiode mit einem Gegner – passend zu asynchronen Kämpfen, die einzeln
 * eintreffen. Gleitkomma ist hier unkritisch: Ratings werden nie nachgerechnet, nur
 * fortgeschrieben.
 */

export interface Glicko {
  rating: number;
  rd: number;
  volatility: number;
}

/** Startwerte eines neuen Charakters. */
export const GLICKO_START: Glicko = { rating: 1500, rd: 350, volatility: 0.06 };
/** Systemkonstante τ: wie stark die Volatilität schwanken darf. */
const TAU = 0.5;
const SCALE = 173.7178;
const EPSILON = 0.000001;
/** Untergrenze der Abweichung, damit Ratings nie ganz erstarren. */
const MIN_RD = 30;

/**
 * Neues Rating nach einem Ergebnis gegen einen Gegner. `score`: 1 Sieg, 0,5 Unentschieden,
 * 0 Niederlage.
 */
export function glickoUpdate(me: Glicko, opponent: Glicko, score: number): Glicko {
  const mu = (me.rating - 1500) / SCALE;
  const phi = me.rd / SCALE;
  const muJ = (opponent.rating - 1500) / SCALE;
  const phiJ = opponent.rd / SCALE;

  const g = 1 / Math.sqrt(1 + (3 * phiJ * phiJ) / (Math.PI * Math.PI));
  const e = 1 / (1 + Math.exp(-g * (mu - muJ)));
  const v = 1 / (g * g * e * (1 - e));
  const delta = v * g * (score - e);

  // Neue Volatilität nach dem Illinois-Verfahren
  const a = Math.log(me.volatility * me.volatility);
  const f = (x: number) => {
    const ex = Math.exp(x);
    return (
      (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) -
      (x - a) / (TAU * TAU)
    );
  };
  let lo = a;
  let hi: number;
  if (delta * delta > phi * phi + v) hi = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    hi = a - k * TAU;
  }
  let fLo = f(lo);
  let fHi = f(hi);
  for (let i = 0; i < 100 && Math.abs(hi - lo) > EPSILON; i++) {
    const c = lo + ((lo - hi) * fLo) / (fHi - fLo);
    const fC = f(c);
    if (fC * fHi <= 0) {
      lo = hi;
      fLo = fHi;
    } else fLo /= 2;
    hi = c;
    fHi = fC;
  }
  const sigma = Math.exp(lo / 2);

  const phiStar = Math.sqrt(phi * phi + sigma * sigma);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * g * (score - e);
  return {
    rating: muNew * SCALE + 1500,
    rd: Math.max(MIN_RD, phiNew * SCALE),
    volatility: sigma,
  };
}

/** Erwartete Siegchance von `me` gegen `opponent` (0–1), z. B. für Anzeigen. */
export function expectedScore(me: Glicko, opponent: Glicko): number {
  const phiJ = opponent.rd / SCALE;
  const g = 1 / Math.sqrt(1 + (3 * phiJ * phiJ) / (Math.PI * Math.PI));
  return 1 / (1 + Math.exp((-g * (me.rating - opponent.rating)) / SCALE));
}
