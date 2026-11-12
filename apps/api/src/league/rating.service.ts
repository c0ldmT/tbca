import { Inject, Injectable } from '@nestjs/common';

import { LEAGUE_REPOSITORY } from '../tokens.js';
import { glickoUpdate } from './glicko2.js';
import type { LeagueRepository, RatingRecord } from './types.js';

/**
 * Glicko-2-Rating aus gewerteten Kämpfen (Herausforderungen und Liga; Spezifikation,
 * Abschnitt 9). Beide Seiten werden fortgeschrieben, auch Bot-Spieler.
 */
@Injectable()
export class RatingService {
  constructor(@Inject(LEAGUE_REPOSITORY) private readonly repo: LeagueRepository) {}

  /** `winner`: 0 = a gewinnt, 1 = b gewinnt, null = Unentschieden. */
  async record(seasonId: string, a: string, b: string, winner: 0 | 1 | null): Promise<void> {
    await this.repo.updateRatings(seasonId, [a, b], (current) => {
      const ra = current.get(a)!;
      const rb = current.get(b)!;
      const score = winner === null ? 0.5 : winner === 0 ? 1 : 0;
      return [apply(ra, rb, score), apply(rb, ra, 1 - score)];
    });
  }
}

function apply(me: RatingRecord, opponent: RatingRecord, score: number): RatingRecord {
  const next = glickoUpdate(me, opponent, score);
  return {
    ...me,
    ...next,
    games: me.games + 1,
    wins: me.wins + (score === 1 ? 1 : 0),
    losses: me.losses + (score === 0 ? 1 : 0),
    draws: me.draws + (score === 0.5 ? 1 : 0),
  };
}
