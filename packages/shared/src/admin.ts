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
  /** Versionsnummer, null = veröffentlichte Version, 'defaults' = Startwerte aus dem Code. */
  from: z.union([z.number().int().min(1), z.literal('defaults')]).nullable(),
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

/** POST /api/admin/simulations/report – Balancing-Report über mehrere Stufen zum Export. */
export const adminSimulationReportSchema = z.object({
  version: z.number().int().min(1).optional(),
  /** Kämpfe je Paarung und Stufe. */
  fights: z.number().int().min(10).max(200).default(60),
  /** Dungeon-Runs je Klasse und Stufe. */
  runs: z.number().int().min(4).max(100).default(20),
  seed: z.string().min(1).max(40).optional(),
});
export type AdminSimulationReportRequest = z.input<typeof adminSimulationReportSchema>;

export const SIM_REPORT_FORMAT = 'tbca-sim-report/v1';

/** Stufen des Reports: Level und typischer Ausrüstungsstand. */
export const SIM_REPORT_POINTS = [
  { level: 3, gear: 'common' },
  { level: 10, gear: 'common' },
  { level: 20, gear: 'common' },
  { level: 30, gear: 'rare' },
  { level: 50, gear: 'rare' },
  { level: 80, gear: 'epic' },
] as const;

export interface AdminSimulationReport {
  format: typeof SIM_REPORT_FORMAT;
  generatedAt: string;
  version: number;
  status: 'draft' | 'published' | 'archived';
  seed: string;
  fights: number;
  runs: number;
  ms: number;
  points: { level: number; gear: string; matchups: MatchupResult; dungeon: DungeonSimResult }[];
  /** Vollständige Konfiguration der Version, damit der Report für sich steht. */
  config: Record<string, unknown>;
}

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

// --- Season-Steuerung -----------------------------------------------------------

export const DAILY_LIMIT_KINDS = ['dungeon', 'fights', 'passive'] as const;
export type DailyLimitKind = (typeof DAILY_LIMIT_KINDS)[number];

/** POST /api/admin/season/daily-reset – Tageslimits für alle oder einen Account zurücksetzen. */
export const adminDailyResetSchema = z.object({
  kinds: z.array(z.enum(DAILY_LIMIT_KINDS)).min(1).max(3),
  /** Fehlt er, gilt die Rücksetzung für alle Charaktere der Season. */
  accountId: z.uuid().nullable().default(null),
  reason: z.string().trim().min(3).max(200),
});

export const SEASON_JOB_IDS = [
  'season-stats',
  'flush-passive-xp',
  'expire-dungeon-runs',
  'end-dungeon-runs',
  'bot-agents',
] as const;
export type SeasonJobId = (typeof SEASON_JOB_IDS)[number];

/** POST /api/admin/season/reset – Fortschritt oder alle Spielerdaten der Season löschen. */
export const adminSeasonResetSchema = z.object({
  /** progress: Charaktere bleiben (Level 1, ohne Items); wipe: Spieler-Charaktere werden gelöscht. */
  mode: z.enum(['progress', 'wipe']),
  /** Zur Bestätigung exakt der Slug der laufenden Season. */
  confirm: z.string().min(1).max(80),
  reason: z.string().trim().min(3).max(200),
});

/** PUT /api/admin/season/end – Ende der laufenden Season verschieben. */
export const adminSeasonEndSchema = z.object({ endsAt: z.iso.datetime({ offset: true }) });

export interface AdminSeasonView {
  season: {
    id: string;
    slug: string;
    name: string;
    isTest: boolean;
    startsAt: string;
    endsAt: string;
  };
  /** Spieltag (Zeitzone des Spiels), auf den sich die Tageszahlen beziehen. */
  day: string;
  gameNow: string;
  medianLevel: number | null;
  stats: {
    characters: number;
    bots: number;
    playedToday: number;
    dungeonRunsToday: number;
    activeRuns: number;
    rewardedFightsToday: number;
    passiveXpToday: number;
  };
  limits: { dungeonRunsPerDay: number; rewardedFightsPerDay: number };
  /** Rücksetzungen des heutigen Tages, neueste zuerst. */
  resetsToday: { kind: 'dungeon' | 'fights'; characterName: string | null; at: string }[];
}

export interface AdminJobResult {
  job: SeasonJobId;
  ms: number;
  result: Record<string, unknown>;
}

export interface AdminSeasonResetResult {
  mode: 'progress' | 'wipe';
  characters: number;
  fights: number;
  runs: number;
  items: number;
}

// --- Datenexport für Balancing ---------------------------------------------------

export const DATA_EXPORT_FORMAT = 'tbca-data/v1';

/** GET /api/admin/export?days=&maxFights= – anonymisierter Export der Spieldaten. */
export const adminDataExportQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  maxFights: z.coerce.number().int().min(100).max(20_000).default(5_000),
});

/** Kampfteilnehmer im Export: Build und Werte, ohne Namen und IDs. */
export interface ExportFighter {
  ref: string | null;
  /** null bei Monstern. */
  classId: string | null;
  level: number;
  affinity: string | null;
  attributes: Record<string, number>;
  stats: Record<string, number>;
  attack: Record<string, unknown>;
  modifiers: Record<string, number>;
  abilities: string[];
  tactics: readonly unknown[];
}

export interface AdminDataExport {
  format: typeof DATA_EXPORT_FORMAT;
  generatedAt: string;
  engineVersion: number;
  season: { name: string; isTest: boolean; configVersion: number; day: string };
  window: { since: string; days: number; maxFights: number };
  configVersions: { version: number; status: string; publishedAt: string | null }[];
  config: Record<string, unknown>;
  characters: {
    ref: string;
    isBot: boolean;
    classId: string;
    level: number;
    xp: number;
    allocated: Record<string, number>;
    createdDay: string;
    loadout: { abilities: string[]; tactics: unknown[] } | null;
    equipment: Record<string, unknown>[];
  }[];
  fights: {
    day: string;
    at: string;
    kind: string;
    configVersion: number;
    engineVersion: number;
    rounds: number;
    winnerTeam: number | null;
    reason: string;
    teams: ExportFighter[][];
    rewards: {
      ref: string | null;
      team: number;
      won: boolean;
      rewarded: boolean;
      xp: number;
      credits: number;
    }[];
  }[];
  dungeonRuns: Record<string, unknown>[];
  economy: {
    credits: { kind: string; transactions: number; toPlayers: number; fromPlayers: number }[];
    items: { templateId: string; rarity: number; source: string; count: number }[];
    shopPurchases: { day: string; offerId: string; count: number }[];
  };
  passiveXp: { day: string; accounts: number; raw: number; awarded: number; messages: number }[];
}
