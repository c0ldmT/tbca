import type { CombatantSnapshot } from '@tbca/game-core';

import type { Glicko } from './glicko2.js';

export type TeamSize = 2 | 3;

export interface TeamRatingRecord extends Glicko {
  teamId: string;
  seasonId: string;
  size: TeamSize;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  leagueJoined: boolean;
}

export interface TeamLeaderboardRow extends TeamRatingRecord {
  name: string;
  tag: string;
  logo: string;
  community: string;
}

export interface TeamCycleRecord {
  id: string;
  seasonId: string;
  size: TeamSize;
  number: number;
  status: 'active' | 'finished';
  startsAt: Date;
  endsAt: Date;
  finishedAt: Date | null;
}

export interface TeamMemberRecord {
  cycleId: string;
  teamId: string;
  division: number;
  ratingAtStart: number;
  place: number | null;
  movement: 'up' | 'down' | 'stay' | null;
}

export interface TeamMatchRecord {
  id: string;
  cycleId: string;
  division: number;
  matchday: number;
  lockAt: Date;
  playAt: Date;
  aTeamId: string | null;
  bTeamId: string | null;
  status: 'scheduled' | 'locked' | 'played' | 'bye';
  /** [Aufstellung a, Aufstellung b]; leer = nicht antrittsfähig. */
  snapshots: CombatantSnapshot[][] | null;
  fightId: string | null;
  winnerTeamId: string | null;
  draw: boolean;
}

export type NewTeamMatch = Omit<
  TeamMatchRecord,
  'id' | 'cycleId' | 'snapshots' | 'fightId' | 'winnerTeamId' | 'draw'
>;

/** Team-Rating und Team-Liga; je Season und Größe getrennt. */
export interface TeamLeagueRepository {
  ratings(
    seasonId: string,
    size: TeamSize,
    teamIds: readonly string[],
  ): Promise<Map<string, TeamRatingRecord>>;
  /** Wie bei Einzel-Ratings: gesperrt lesen (fehlende mit Startwerten), fortschreiben, speichern. */
  updateRatings(
    seasonId: string,
    size: TeamSize,
    teamIds: readonly string[],
    update: (current: Map<string, TeamRatingRecord>) => TeamRatingRecord[],
  ): Promise<TeamRatingRecord[]>;
  setJoined(
    seasonId: string,
    size: TeamSize,
    teamId: string,
    joined: boolean,
  ): Promise<TeamRatingRecord>;
  entrants(seasonId: string, size: TeamSize, minGames: number): Promise<TeamRatingRecord[]>;
  leaderboard(
    seasonId: string,
    size: TeamSize,
    options: { minGames: number; limit: number },
  ): Promise<TeamLeaderboardRow[]>;

  activeCycle(seasonId: string, size: TeamSize): Promise<TeamCycleRecord | null>;
  lastCycle(seasonId: string, size: TeamSize): Promise<TeamCycleRecord | null>;
  createCycle(input: {
    seasonId: string;
    size: TeamSize;
    number: number;
    startsAt: Date;
    endsAt: Date;
    members: Omit<TeamMemberRecord, 'cycleId' | 'place' | 'movement'>[];
    matches: NewTeamMatch[];
  }): Promise<TeamCycleRecord>;
  members(cycleId: string): Promise<TeamMemberRecord[]>;
  matches(cycleId: string): Promise<TeamMatchRecord[]>;
  nextEvent(cycleId: string): Promise<{ kind: 'lock' | 'play'; at: Date } | null>;
  lockMatches(updates: { id: string; snapshots: CombatantSnapshot[][] }[]): Promise<void>;
  finishMatch(
    id: string,
    result: { fightId: string | null; winnerTeamId: string | null; draw: boolean },
  ): Promise<void>;
  finishCycle(
    cycleId: string,
    at: Date,
    rows: { teamId: string; place: number; movement: 'up' | 'down' | 'stay' }[],
  ): Promise<void>;
}
