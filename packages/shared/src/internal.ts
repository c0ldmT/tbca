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

/** Dungeon über den Bot: Status, Start oder eine Entscheidung (Abschnitt 8). */
export const discordDungeonSchema = discordUserSchema.extend({
  action: z.enum(['status', 'start', 'continue', 'heal', 'leave']),
  /** Nur beim Start: mitgenommene Heil-Injektoren und Backup-Chip. */
  injectors: z.number().int().min(0).max(10).optional(),
  backupChip: z.boolean().optional(),
});

/** Team-Herausforderung über den Bot; Gegner per Kürzel, Aufstellung automatisch. */
export const discordTeamChallengeSchema = discordUserSchema.extend({
  opponentTag: z.string().min(2).max(5),
  size: z.union([z.literal(2), z.literal(3)]),
  mode: z.enum(['rated', 'friendly']),
});

/** Kompakte Dungeon-Sicht für Discord-Nachrichten mit Buttons. */
export interface DiscordDungeonView {
  status: 'none' | 'active' | 'left' | 'timed_out' | 'defeated' | 'saved';
  floor: number;
  hp: number;
  maxHp: number;
  injectors: number;
  /** Versiegelte Funde (Inhalt erst beim Ausstieg). */
  finds: number;
  /** Nach dem Ausstieg: gutgeschriebene Credits und Items mit Stern und Namen je Sprache. */
  credits: number;
  items: { templateId: string; rarity: number; names: { de: string; en: string } }[];
  xpGained: number;
  next: { floor: number; monsterLevel: number; boss: boolean } | null;
  /** Ergebnis der eben gespielten Etage, falls „Weiter“ gedrückt wurde. */
  lastFloor: { floor: number; won: boolean } | null;
  runsLeft: number;
  fee: number;
  canHeal: boolean;
  url: string;
}

export interface DiscordTeamView {
  teams: {
    name: string;
    tag: string;
    community: string;
    joinCode: string;
    captain: boolean;
    members: { name: string; level: number; classId: string | null }[];
  }[];
  url: string;
}

export interface DiscordTeamFightSummary {
  ownTag: string;
  opponentTag: string;
  size: 2 | 3;
  won: boolean;
  draw: boolean;
  rewards: { name: string; xp: number; credits: number }[];
  replayUrl: string;
}

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

// --- Liga über Discord ------------------------------------------------------------

/** Kanal für Liga-Ankündigungen setzen oder abschalten (höchstens einer je Server). */
export const discordLeagueChannelSchema = discordChannelXpSchema;

/** Liga über den Bot: Stand, An-/Abmelden oder Platzierungskampf. */
export const discordLeagueSchema = discordUserSchema.extend({
  action: z.enum(['status', 'join', 'leave', 'placement']),
});

export interface DiscordLeagueView {
  rating: number | null;
  games: number;
  placementLeft: number;
  joined: boolean;
  division: { index: number; count: number; place: number; points: number; size: number } | null;
  next: { matchday: number; playAt: string; locked: boolean } | null;
  /** Nur bei `placement`: der gespielte Platzierungskampf. */
  fight: DiscordFightSummary | null;
  url: string;
}

export interface DiscordLeagueMatchResult {
  a: string;
  b: string;
  /** Name des Siegers, null bei Unentschieden. */
  winner: string | null;
  url: string | null;
}

export type DiscordLeagueNewsItem =
  | {
      kind: 'matchday';
      cycle: number;
      matchday: number;
      playAt: string;
      results: DiscordLeagueMatchResult[];
    }
  | {
      kind: 'cycle_end';
      cycle: number;
      rows: { name: string; division: number; place: number; movement: 'up' | 'down' | 'stay' }[];
    };

/** Ankündigungen je Kanal, nur mit Spielern der Heimat-Community des Servers. */
export interface DiscordLeagueNews {
  guildId: string;
  channelId: string;
  items: DiscordLeagueNewsItem[];
  url: string;
}
