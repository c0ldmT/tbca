import { formDivisions, roundRobin, type LeagueRules } from '@tbca/game-core';

import { addDays, dayKey, zonedTime } from '../fight/day.js';

/** Paarung im Spielplan; `b` = null heißt spielfrei. */
export interface ScheduledPairing {
  division: number;
  matchday: number;
  lockAt: Date;
  playAt: Date;
  a: string;
  b: string | null;
}

export interface CyclePlan {
  divisions: string[][];
  startsAt: Date;
  endsAt: Date;
  pairings: ScheduledPairing[];
}

/**
 * Einteilung und Spielplan eines neuen Zyklus – für Einzel- und Team-Liga gleich. `previous`
 * liefert das Abschneiden im letzten Zyklus. Der erste Spieltag ist der früheste, dessen Lock
 * nach `base` liegt. Null, wenn zu wenige Teilnehmer da sind.
 */
export function planCycle(
  rules: LeagueRules,
  entrants: readonly { id: string; rating: number }[],
  previous: (
    id: string,
  ) => { division: number; place: number; movement: 'up' | 'down' | 'stay' } | null,
  base: number,
  timeZone: string,
): CyclePlan | null {
  if (entrants.length < Math.max(2, rules.minPlayers)) return null;
  const divisions = formDivisions(
    rules,
    entrants.map((e) => ({ characterId: e.id, rating: e.rating, previous: previous(e.id) })),
  );
  if (divisions.length === 0) return null;

  const at = (day: string) => zonedTime(day, rules.matchdayHour, rules.matchdayMinute, timeZone);
  const lockMs = rules.lockMinutes * 60_000;
  let day = dayKey(base, timeZone);
  while (at(day) - lockMs <= base) day = addDays(day, 1);

  const pairings: ScheduledPairing[] = [];
  divisions.forEach((ids, division) => {
    roundRobin(ids).forEach((pairs, round) => {
      const playAt = at(addDays(day, round));
      for (const p of pairs)
        pairings.push({
          division,
          matchday: round + 1,
          lockAt: new Date(playAt - lockMs),
          playAt: new Date(playAt),
          a: p.a,
          b: p.b,
        });
    });
  });
  const plays = pairings.map((m) => m.playAt.getTime());
  return {
    divisions,
    startsAt: new Date(Math.min(...plays)),
    endsAt: new Date(Math.max(...plays)),
    pairings,
  };
}
