import type { ClassId } from '@tbca/game-core';
import { z } from 'zod';

/** GET /api/league/leaderboard?scope=&limit= */
export const leaderboardQuerySchema = z.object({
  /** global oder die Heimat-Community des eigenen Accounts. */
  scope: z.enum(['global', 'community']).default('global'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export interface LeagueCharacterRef {
  id: string;
  name: string;
  classId: ClassId;
  level: number;
}

export interface RatingView {
  /** Gerundet; intern Glicko-2 mit Nachkommastellen. */
  rating: number;
  rd: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Gewertete Kämpfe bis zur Einteilung. */
  placementLeft: number;
}

export interface LeagueTableRow extends LeagueCharacterRef {
  place: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  movement: 'up' | 'down' | 'stay';
  me: boolean;
}

export interface LeagueMatchView {
  id: string;
  matchday: number;
  lockAt: string;
  playAt: string;
  status: 'scheduled' | 'locked' | 'played' | 'bye';
  a: LeagueCharacterRef | null;
  b: LeagueCharacterRef | null;
  /** Sieger-ID; null bei Unentschieden oder offen. */
  winnerId: string | null;
  draw: boolean;
  fightId: string | null;
}

export interface LeagueView {
  rating: RatingView | null;
  joined: boolean;
  cycle: {
    id: string;
    number: number;
    status: 'active' | 'finished';
    startsAt: string;
    endsAt: string;
  } | null;
  /** Eigene Division im aktuellen (oder zuletzt beendeten) Zyklus. */
  division: {
    index: number;
    count: number;
    table: LeagueTableRow[];
    matches: LeagueMatchView[];
  } | null;
  /** Nächster eigener Spieltag. */
  next: { matchday: number; lockAt: string; playAt: string; locked: boolean } | null;
  rules: {
    divisionSize: number;
    promote: number;
    relegate: number;
    lockMinutes: number;
    placementGames: number;
    matchday: string;
    points: { win: number; draw: number; loss: number };
  };
}

/** GET /api/league/divisions/:index – eine Division des aktuellen Zyklus. */
export interface LeagueDivisionView {
  cycle: NonNullable<LeagueView['cycle']>;
  division: NonNullable<LeagueView['division']>;
}

export interface LeaderboardEntry extends LeagueCharacterRef {
  place: number;
  rating: number;
  rd: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  isBot: boolean;
  me: boolean;
}

export interface LeagueTickResult {
  locked: number;
  played: number;
  cyclesStarted: number;
  cyclesFinished: number;
}
