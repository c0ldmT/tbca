import type { ClassId, CombatantSnapshot } from '@tbca/game-core';

import type { Glicko } from './glicko2.js';

export interface RatingRecord extends Glicko {
  characterId: string;
  seasonId: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  leagueJoined: boolean;
}

export interface LeaderboardRow extends RatingRecord {
  name: string;
  level: number;
  classId: ClassId;
  isBot: boolean;
}

export interface CycleRecord {
  id: string;
  seasonId: string;
  number: number;
  status: 'active' | 'finished';
  startsAt: Date;
  endsAt: Date;
  finishedAt: Date | null;
}

export interface MemberRecord {
  cycleId: string;
  characterId: string;
  division: number;
  ratingAtStart: number;
  place: number | null;
  movement: 'up' | 'down' | 'stay' | null;
}

export interface MatchRecord {
  id: string;
  cycleId: string;
  division: number;
  matchday: number;
  lockAt: Date;
  playAt: Date;
  aCharacterId: string | null;
  bCharacterId: string | null;
  status: 'scheduled' | 'locked' | 'played' | 'bye';
  snapshots: CombatantSnapshot[] | null;
  fightId: string | null;
  winnerCharacterId: string | null;
  draw: boolean;
}

export type NewMatch = Omit<
  MatchRecord,
  'id' | 'cycleId' | 'snapshots' | 'fightId' | 'winnerCharacterId' | 'draw'
>;

export interface LeagueRepository {
  /** Ratings der Charaktere (fehlende fehlen in der Map). */
  ratings(characterIds: readonly string[]): Promise<Map<string, RatingRecord>>;
  /**
   * Schreibt Ratings in einer Transaktion fort: liest die Zeilen gesperrt (fehlende mit
   * Startwerten), ruft `update` und speichert das Ergebnis.
   */
  updateRatings(
    seasonId: string,
    characterIds: readonly string[],
    update: (current: Map<string, RatingRecord>) => RatingRecord[],
  ): Promise<RatingRecord[]>;
  /** An- oder Abmelden für kommende Zyklen; legt das Rating bei Bedarf an. */
  setJoined(seasonId: string, characterId: string, joined: boolean): Promise<RatingRecord>;
  /** Angemeldete Charaktere der Season mit mindestens `minGames` gewerteten Kämpfen. */
  entrants(seasonId: string, minGames: number): Promise<RatingRecord[]>;
  leaderboard(
    seasonId: string,
    /** `homeOfAccount`: nur Charaktere mit derselben Heimat-Community wie dieser Account. */
    options: { minGames: number; limit: number; homeOfAccount: string | null },
  ): Promise<LeaderboardRow[]>;

  activeCycle(seasonId: string): Promise<CycleRecord | null>;
  lastCycle(seasonId: string): Promise<CycleRecord | null>;
  findCycle(id: string): Promise<CycleRecord | null>;
  createCycle(input: {
    seasonId: string;
    number: number;
    startsAt: Date;
    endsAt: Date;
    members: Omit<MemberRecord, 'cycleId' | 'place' | 'movement'>[];
    matches: NewMatch[];
  }): Promise<CycleRecord>;
  members(cycleId: string): Promise<MemberRecord[]>;
  matches(cycleId: string): Promise<MatchRecord[]>;
  /** Frühester offener Termin des Zyklus: Lock geplanter oder Spiel gesperrter Paarungen. */
  nextEvent(cycleId: string): Promise<{ kind: 'lock' | 'play'; at: Date } | null>;
  lockMatches(updates: { id: string; snapshots: CombatantSnapshot[] }[]): Promise<void>;
  finishMatch(
    id: string,
    result: { fightId: string | null; winnerCharacterId: string | null; draw: boolean },
  ): Promise<void>;
  finishCycle(
    cycleId: string,
    at: Date,
    rows: { characterId: string; place: number; movement: 'up' | 'down' | 'stay' }[],
  ): Promise<void>;
  /** Letzte Zyklen, in denen der Charakter mitspielte (neueste zuerst). */
  memberships(characterId: string, limit: number): Promise<MemberRecord[]>;
}
