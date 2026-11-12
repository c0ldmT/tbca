import { Inject, Injectable } from '@nestjs/common';

import { LEAGUE_REPOSITORY, TEAM_LEAGUE_REPOSITORY } from '../tokens.js';
import { glickoUpdate, type Glicko } from './glicko2.js';
import type { TeamLeagueRepository, TeamSize } from './team-types.js';
import type { LeagueRepository } from './types.js';

/**
 * Glicko-2-Rating aus gewerteten Kämpfen (Herausforderungen und Liga; Spezifikation,
 * Abschnitt 9). Beide Seiten werden fortgeschrieben, auch Bot-Spieler.
 */
@Injectable()
export class RatingService {
  constructor(
    @Inject(LEAGUE_REPOSITORY) private readonly repo: LeagueRepository,
    @Inject(TEAM_LEAGUE_REPOSITORY) private readonly teams: TeamLeagueRepository,
  ) {}

  /** `winner`: 0 = a gewinnt, 1 = b gewinnt, null = Unentschieden. */
  async record(seasonId: string, a: string, b: string, winner: 0 | 1 | null): Promise<void> {
    await this.repo.updateRatings(seasonId, [a, b], (current) => {
      const ra = current.get(a)!;
      const rb = current.get(b)!;
      const score = winner === null ? 0.5 : winner === 0 ? 1 : 0;
      return [apply(ra, rb, score), apply(rb, ra, 1 - score)];
    });
  }

  /** Team-Rating je Größe (2v2 und 3v3 getrennt) aus einem gewerteten Team-Kampf. */
  async recordTeams(
    seasonId: string,
    size: TeamSize,
    a: string,
    b: string,
    winner: 0 | 1 | null,
  ): Promise<void> {
    await this.teams.updateRatings(seasonId, size, [a, b], (current) => {
      const ra = current.get(a)!;
      const rb = current.get(b)!;
      const score = winner === null ? 0.5 : winner === 0 ? 1 : 0;
      return [apply(ra, rb, score), apply(rb, ra, 1 - score)];
    });
  }
}

interface Scored extends Glicko {
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

function apply<T extends Scored>(me: T, opponent: Scored, score: number): T {
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
