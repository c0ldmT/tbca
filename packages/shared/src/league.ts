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
  /** Team-Liga (2v2 und 3v3 zusammen). */
  teams?: Omit<LeagueTickResult, 'teams'>;
}

// --- Team-Liga ----------------------------------------------------------------------

export interface TeamLeagueRef {
  id: string;
  name: string;
  tag: string;
  logo: string;
}

export interface TeamLeagueTableRow extends TeamLeagueRef {
  place: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  movement: 'up' | 'down' | 'stay';
  /** Das eigene Team. */
  mine: boolean;
}

export interface TeamLeagueMatchView {
  id: string;
  matchday: number;
  lockAt: string;
  playAt: string;
  status: 'scheduled' | 'locked' | 'played' | 'bye';
  a: TeamLeagueRef | null;
  b: TeamLeagueRef | null;
  winnerId: string | null;
  draw: boolean;
  fightId: string | null;
}

/** GET /api/teams/:id/league?size= – Team-Liga eines Teams in einer Größe. */
export interface TeamLeagueView {
  size: 2 | 3;
  rating: RatingView | null;
  joined: boolean;
  /** Nur der Kapitän meldet an und ab. */
  captain: boolean;
  cycle: LeagueView['cycle'];
  division: {
    index: number;
    count: number;
    table: TeamLeagueTableRow[];
    matches: TeamLeagueMatchView[];
  } | null;
  next: LeagueView['next'];
  rules: LeagueView['rules'];
}

export interface TeamLeaderboardEntry extends TeamLeagueRef {
  place: number;
  community: string;
  rating: number;
  rd: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export const teamLeagueQuerySchema = z.object({
  size: z.coerce.number().pipe(z.union([z.literal(2), z.literal(3)])),
});

export const teamLeagueJoinSchema = z.object({
  size: z.union([z.literal(2), z.literal(3)]),
  joined: z.boolean(),
});
