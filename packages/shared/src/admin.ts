import type { DungeonSimResult, MatchupResult } from '@tbca/game-core';
import { z } from 'zod';

const DAY = 24 * 60 * 60 * 1000;

/** PUT /api/admin/time – Zeitfaktor (1–1000) und/oder Vorspulen (bis 30 Tage am Stück). */
export const adminTimeSchema = z
  .object({
    factor: z.number().min(1).max(1000).optional(),
    advanceMs: z
      .number()
      .int()
      .min(0)
      .max(30 * DAY)
      .optional(),
  })
  .refine(
    (v) => v.factor !== undefined || v.advanceMs !== undefined,
    'factor oder advanceMs angeben',
  );

export const adminBanSchema = z.object({ reason: z.string().trim().min(3).max(200).nullable() });
export const adminAmountSchema = z.object({
  amount: z
    .number()
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((v) => v !== 0),
  reason: z.string().trim().min(3).max(200),
});

export interface AdminTimeView {
  season: { id: string; name: string; isTest: boolean };
  realNow: string;
  gameNow: string;
  factor: number;
}

export interface AdminAccountView {
  accountId: string;
  identities: { provider: string; displayName: string; providerUserId: string }[];
  character: { id: string; name: string; level: number; xp: number } | null;
  globalRole: 'player' | 'superadmin';
  isBot: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
}

export interface AdminAuditView {
  id: string;
  actorAccountId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

/** PUT /api/admin/config/:version – vollständige Daten eines Entwurfs. */
export const adminConfigUpdateSchema = z.object({
  data: z.object({
    battle: z.record(z.string(), z.unknown()),
    game: z.record(z.string(), z.unknown()),
  }),
  notes: z.string().max(500).nullable(),
});
export const adminConfigDraftSchema = z.object({
  from: z.number().int().min(1).nullable(),
  notes: z.string().max(500).nullable(),
});

export interface AdminConfigList {
  season: { id: string; name: string };
  versions: {
    version: number;
    status: 'draft' | 'published' | 'archived';
    notes: string | null;
    createdAt: string;
    publishedAt: string | null;
  }[];
}

export interface AdminConfigVersion {
  version: number;
  status: 'draft' | 'published' | 'archived';
  notes: string | null;
  data: { battle: Record<string, unknown>; game: Record<string, unknown> };
}

export const BOT_AGENT_IDS = ['casual', 'active', 'farmer', 'climber', 'class_switcher'] as const;
export const adminBotAgentSchema = z.object({ agent: z.enum(BOT_AGENT_IDS).nullable() });

export interface AdminBotView {
  accountId: string;
  agent: (typeof BOT_AGENT_IDS)[number] | null;
  character: {
    id: string;
    name: string;
    level: number;
    classId: 'bruiser' | 'gunner' | 'netrunner' | 'medtech';
  } | null;
}

export interface BotRunResult {
  acted: number;
  actions: number;
  /** Fehlercodes mit Anzahl, z. B. no_runs_left. */
  errors: Record<string, number>;
  skipped: 'real_season' | null;
}

/** POST /api/admin/simulations – Balancing-Simulation gegen eine Konfigurationsversion. */
export const adminSimulationSchema = z.object({
  kind: z.enum(['matchups', 'dungeon']),
  /** Konfigurationsversion; fehlt sie, gilt die veröffentlichte. */
  version: z.number().int().min(1).optional(),
  level: z.number().int().min(1).max(200),
  gear: z.enum(['none', 'common', 'rare', 'epic']),
  /** Kämpfe je Paarung (Matrix) bzw. Runs je Klasse (Dungeon). */
  samples: z.number().int().min(2).max(400),
  seed: z.string().min(1).max(40).optional(),
});
export type AdminSimulationRequest = z.infer<typeof adminSimulationSchema>;

export interface AdminSimulationResponse {
  version: number;
  status: 'draft' | 'published' | 'archived';
  seed: string;
  ms: number;
  /** Gesetzt bei kind = matchups. */
  matchups: MatchupResult | null;
  /** Gesetzt bei kind = dungeon. */
  dungeon: DungeonSimResult | null;
}
