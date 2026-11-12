import type { PvpRules } from '../content/types.js';
import { Xoshiro128ss, type Seed } from '../random/prng.js';

export interface OpponentCandidate {
  readonly id: string;
  readonly level: number;
  readonly isBot: boolean;
}

/**
 * Tägliche Auswahl zufälliger Gegner (Spezifikation, Abschnitt 9): Auf der Website fordert man
 * nur diese heraus, statt frei zu suchen. Bevorzugt werden Gegner im Belohnungsfenster
 * (höchstens `maxLevelsBelow` darunter, ebenso weit darüber); echte Spieler vor Bots, außer in
 * Test-Seasons, wo Bots auch belohnen. Reicht das Fenster nicht, kommen die nächsten Level dazu.
 * Gleicher Seed (Charakter und Tag), gleiche Auswahl.
 */
export function pickDailyOpponents(
  rules: PvpRules,
  input: {
    level: number;
    candidates: readonly OpponentCandidate[];
    seed: Seed;
    testSeason: boolean;
    /** Möglichst nicht wieder wählen (z. B. die bisherige Auswahl beim Neuwürfeln). */
    exclude?: readonly string[];
    /** Abweichende Anzahl, z. B. `dailyTeamOpponents` für Teams. */
    count?: number;
  },
): string[] {
  const rng = Xoshiro128ss.fromSeed(input.seed);
  const count = input.count ?? rules.dailyOpponents;
  const shuffle = <T>(list: T[]): T[] => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = rng.nextInt(i + 1);
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
    return list;
  };
  const gap = (c: OpponentCandidate) => Math.abs(c.level - input.level);
  const inWindow = input.candidates.filter((c) => gap(c) <= rules.maxLevelsBelow);
  const rest = input.candidates
    .filter((c) => gap(c) > rules.maxLevelsBelow)
    .sort((a, b) => gap(a) - gap(b) || (a.id < b.id ? -1 : 1));
  // Bots belohnen nur in Test-Seasons; sonst kommen sie erst ans Ende
  const preferred = (c: OpponentCandidate) => input.testSeason || !c.isBot;
  const ordered = [
    ...shuffle(inWindow.filter(preferred)),
    ...rest.filter(preferred),
    ...shuffle(inWindow.filter((c) => !preferred(c))),
    ...rest.filter((c) => !preferred(c)),
  ];
  const avoid = new Set(input.exclude ?? []);
  return [...ordered.filter((c) => !avoid.has(c.id)), ...ordered.filter((c) => avoid.has(c.id))]
    .slice(0, count)
    .map((c) => c.id);
}

/** Kosten fürs Neuwürfeln der Tagesgegner in Credits. */
export function opponentRerollCost(rules: PvpRules, level: number): number {
  return rules.opponentReroll.base + rules.opponentReroll.perLevel * level;
}
