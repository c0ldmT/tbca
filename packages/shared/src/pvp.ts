import { CLASS_IDS, type BattleEvent, type ClassId, type RewardLimit } from '@tbca/game-core';
import { z } from 'zod';

/** POST /api/pvp/challenges */
export const challengeRequestSchema = z.object({
  opponentId: z.uuid(),
  mode: z.enum(['rated', 'friendly']),
});
export type ChallengeRequest = z.infer<typeof challengeRequestSchema>;

/** POST /api/pvp/training */
export const trainingRequestSchema = z.object({
  classId: z.enum(CLASS_IDS),
  level: z.number().int().min(1).max(1000),
});
export type TrainingRequest = z.infer<typeof trainingRequestSchema>;

export interface RewardView {
  xp: number;
  credits: number;
  rewarded: boolean;
  limit: RewardLimit;
  underdogBonus: number;
}

export interface ChallengeResponse {
  fightId: string;
  won: boolean;
  draw: boolean;
  reward: RewardView;
  level: { before: number; after: number };
}

export interface PvpStatus {
  day: string;
  rewardedToday: number;
  dailyLimit: number;
}

export interface OpponentView {
  id: string;
  name: string;
  level: number;
  classId: ClassId;
  isBot: boolean;
  /** Erwartete XP bei einem Sieg im gewerteten Modus; 0 wenn er nichts brächte. */
  winXp: number;
  limit: RewardLimit;
}

export interface FightCombatantView {
  id: string;
  name: string;
  classId: ClassId | null;
  level: number;
  maxHp: number;
  energyMax: number;
}

/** GET /api/fights/:id – alles, was ein Replay braucht. */
export interface FightView {
  id: string;
  kind: 'pvp_rated' | 'pvp_friendly' | 'training' | 'dungeon' | 'team_rated' | 'team_friendly';
  createdAt: string;
  engineVersion: number;
  configVersion: number;
  seed: string;
  logHash: string;
  winner: number | null;
  reason: 'knockout' | 'timeout';
  rounds: number;
  teams: FightCombatantView[][];
  events: BattleEvent[];
  rewards: { characterId: string; xp: number }[];
}

/** GET /api/fights – eigene letzte Kämpfe. */
export interface FightSummary {
  id: string;
  kind: 'pvp_rated' | 'pvp_friendly' | 'training' | 'dungeon' | 'team_rated' | 'team_friendly';
  createdAt: string;
  won: boolean;
  draw: boolean;
  opponents: string[];
  xp: number;
}
