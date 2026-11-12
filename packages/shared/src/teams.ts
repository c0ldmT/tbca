import type { ClassId, TargetSelector } from '@tbca/game-core';
import { z } from 'zod';

import { TEAM_FOCUS, TEAM_LOGOS } from './constants.js';
import { checkName } from './names.js';

export const createTeamSchema = z.object({
  communityId: z.uuid(),
  name: z
    .string()
    .trim()
    .superRefine((name, ctx) => {
      const problem = checkName(name);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    }),
  tag: z
    .string()
    .trim()
    .transform((t) => t.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{2,5}$/)),
  logo: z.enum(TEAM_LOGOS),
});

export const joinTeamSchema = z.object({ code: z.string().trim().min(4).max(12) });
export const kickSchema = z.object({ accountId: z.uuid() });
export const teamSettingsSchema = z.object({
  focus: z.enum(TEAM_FOCUS),
  lineup2: z.array(z.uuid()).max(2),
  lineup3: z.array(z.uuid()).max(3),
});
export const teamChallengeSchema = z.object({
  opponentTeamId: z.uuid(),
  size: z.union([z.literal(2), z.literal(3)]),
  lineup: z.array(z.uuid()).min(2).max(3),
  mode: z.enum(['rated', 'friendly']),
});

export interface CommunityView {
  id: string;
  slug: string;
  name: string;
  member: boolean;
  home: boolean;
  role: 'member' | 'moderator' | 'admin' | null;
}

export const communityRoleSchema = z.object({ role: z.enum(['member', 'moderator', 'admin']) });

export interface CommunityMemberView {
  accountId: string;
  role: 'member' | 'moderator' | 'admin';
  home: boolean;
  character: { name: string; level: number; xp: number; classId: ClassId } | null;
}

export interface TeamMemberView {
  accountId: string;
  /** Charakter in der laufenden Season, sonst null. */
  character: { id: string; name: string; level: number; classId: ClassId } | null;
  captain: boolean;
}

export interface TeamView {
  id: string;
  name: string;
  tag: string;
  logo: (typeof TEAM_LOGOS)[number];
  community: { id: string; name: string };
  joinCode: string;
  focus: TargetSelector;
  lineup2: string[];
  lineup3: string[];
  members: TeamMemberView[];
  captain: boolean;
}

export interface TeamSummary {
  id: string;
  name: string;
  tag: string;
  logo: (typeof TEAM_LOGOS)[number];
  community: string;
  members: number;
  averageLevel: number;
}

/** Gegnerisches Tages-Team: Nur diese lassen sich auf der Website herausfordern. */
export interface TeamOpponentView extends TeamSummary {
  /** Alle Mitglieder sind Bots (belohnen nur in Test-Seasons). */
  isBot: boolean;
}

export interface TeamChallengeReward {
  name: string;
  xp: number;
  credits: number;
  limit: string;
  levelUp: number | null;
}

export interface TeamChallengeResponse {
  fightId: string;
  won: boolean;
  draw: boolean;
  rewards: TeamChallengeReward[];
  /** Nur bei angenommenen Discord-Herausforderungen: Belohnung des annehmenden Teams. */
  opponentRewards?: TeamChallengeReward[];
}
