import { CLASS_IDS } from '@tbca/game-core';
import { z } from 'zod';

/**
 * Interne API für Bots (Abschnitt 15): Bots sind dünne Clients und rufen sie mit Service-Token
 * auf. Plattform-Nutzer werden ausschließlich über ihre IDs zugeordnet.
 */
const snowflake = z.string().regex(/^\d{5,25}$/);

export const discordUserSchema = z.object({
  userId: snowflake,
  displayName: z.string().min(1).max(100),
});

export const discordSetupSchema = z.object({
  guildId: snowflake,
  guildName: z.string().min(1).max(100),
  /** Wer einrichtet, wird Community-Admin. */
  userId: snowflake.optional(),
  displayName: z.string().min(1).max(100).optional(),
});

export const discordChannelXpSchema = z.object({
  guildId: snowflake,
  channelId: snowflake,
  enabled: z.boolean(),
});

export const discordRegisterSchema = discordUserSchema.extend({
  guildId: snowflake,
  name: z.string().min(1).max(80),
  classId: z.enum(CLASS_IDS),
});

/** Nur Länge und ein kurzlebiger Hash – nie der Inhalt (Abschnitt 11). */
export const discordActivitySchema = discordUserSchema.extend({
  eventId: snowflake,
  guildId: snowflake,
  channelId: snowflake,
  length: z.number().int().min(0).max(10_000),
  hash: z.string().regex(/^[0-9a-f]{16,64}$/),
});

export const discordChallengeSchema = discordUserSchema.extend({
  opponentUserId: snowflake,
  mode: z.enum(['rated', 'friendly']),
});

export interface DiscordProfileView {
  name: string;
  classId: string;
  level: number;
  xp: number;
  xpToNext: number | null;
  credits: number;
  url: string;
}

export interface DiscordActivityResult {
  /**
   * Vorgemerkte XP (vor Deckelung). Gebucht wird gebündelt durch den Worker
   * (Job „flush-passive-xp“); erst dort greift das Tageslimit genau.
   */
  queued: number;
  reason:
    | 'queued'
    | 'not_registered'
    | 'channel_disabled'
    | 'too_short'
    | 'cooldown'
    | 'repeat'
    | 'duplicate'
    | 'daily_cap';
}

/** Ergebnis des Bündel-Jobs für passive XP. */
export interface PassiveFlushResult {
  /** Verarbeitete Vormerkungen. */
  entries: number;
  /** Gebuchte Bündel (je Account und Tag eins). */
  bundles: number;
  /** Insgesamt gutgeschriebene XP nach Deckelung. */
  awarded: number;
  /** Level-Aufstiege in diesem Lauf. */
  levelUps: number;
}

/** Kompakte Zusammenfassung für den Chat: Sieger, Runden, bester Treffer, Link zum Replay. */
export interface DiscordFightSummary {
  winner: string | null;
  rounds: number;
  bestHit: { name: string; value: number } | null;
  xp: number;
  credits: number;
  limit: string;
  levelUp: number | null;
  url: string;
}
