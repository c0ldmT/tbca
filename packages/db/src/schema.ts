/**
 * Drizzle-Grundschema (Spezifikation, Abschnitt 16).
 *
 * Konventionen:
 * - Primärschlüssel sind UUIDv7 (zeitlich sortierbar), erzeugt in der Anwendung.
 * - Zeitstempel sind `timestamptz`.
 * - Spielbezogene Tabellen tragen eine `season_id`; Spielwerte liegen versioniert in
 *   `config_version` und hängen an einer Season.
 */
import type { BattleInput, BattleRules, GameConfig, TacticRule } from '@tbca/game-core';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// --- Enums ------------------------------------------------------------------

export const locale = pgEnum('locale', ['de', 'en']);
export const identityProvider = pgEnum('identity_provider', ['discord', 'twitch']);
export const globalRole = pgEnum('global_role', ['player', 'superadmin']);
export const communityRole = pgEnum('community_role', ['member', 'moderator', 'admin']);
export const channelKind = pgEnum('channel_kind', [
  'discord_guild',
  'discord_channel',
  'twitch_channel',
]);
export const seasonStatus = pgEnum('season_status', ['planned', 'active', 'ended']);
export const configStatus = pgEnum('config_status', ['draft', 'published', 'archived']);
export const characterClass = pgEnum('character_class', [
  'bruiser',
  'gunner',
  'netrunner',
  'medtech',
]);

// --- Seasons & Konfiguration -------------------------------------------------

export const season = pgTable(
  'season',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    status: seasonStatus('status').notNull().default('planned'),
    /** Test-Seasons zählen nicht für Ranglisten und erlauben Zeitsteuerung. */
    isTest: boolean('is_test').notNull().default(false),
    /** Zeitfaktor des Clock-Service (nur Test-Seasons, sonst 1). */
    timeFactor: doublePrecision('time_factor').notNull().default(1),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('season_period_check', sql`${t.endsAt} > ${t.startsAt}`),
    check(
      'season_time_factor_check',
      sql`${t.timeFactor} > 0 AND (${t.isTest} OR ${t.timeFactor} = 1)`,
    ),
    // Höchstens eine echte Season ist aktiv.
    uniqueIndex('season_single_active_idx')
      .on(t.status)
      .where(sql`${t.status} = 'active' AND NOT ${t.isTest}`),
  ],
);

/** Inhalt einer Konfigurationsversion; wächst mit jeder Phase (schemaVersion). */
export interface SeasonConfigData {
  battle: BattleRules;
  /** Ab Konfigurationsschema 2; fehlt er, gelten die Startwerte aus game-core. */
  game?: GameConfig;
}

export const configVersion = pgTable(
  'config_version',
  {
    id: id(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** Version des Formats von `data`, für spätere Migrationen der Konfiguration. */
    schemaVersion: integer('schema_version').notNull(),
    status: configStatus('status').notNull().default('draft'),
    data: jsonb('data').$type<SeasonConfigData>().notNull(),
    notes: text('notes'),
    createdByAccountId: uuid('created_by_account_id').references(() => account.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('config_version_season_version_idx').on(t.seasonId, t.version),
    // Pro Season ist genau eine Version veröffentlicht.
    uniqueIndex('config_version_single_published_idx')
      .on(t.seasonId)
      .where(sql`${t.status} = 'published'`),
    check('config_version_version_check', sql`${t.version} >= 1`),
  ],
);

// --- Accounts & Identitäten ---------------------------------------------------

export const account = pgTable('account', {
  id: id(),
  globalRole: globalRole('global_role').notNull().default('player'),
  /** Bevorzugte Sprache; null = Standard der Community bzw. Browser. */
  locale: locale('locale'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Plattform-Identität. Zuordnung ausschließlich über die Plattform-ID, nie über Namen. */
export const identity = pgTable(
  'identity',
  {
    id: id(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    provider: identityProvider('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: createdAt(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('identity_provider_user_idx').on(t.provider, t.providerUserId),
    // Pro Account höchstens eine Identität je Plattform.
    uniqueIndex('identity_account_provider_idx').on(t.accountId, t.provider),
  ],
);

/**
 * Server-Session. Im Cookie steht nur ein zufälliges Token; gespeichert wird sein
 * SHA-256-Hash, damit ein Datenbank-Leak keine gültigen Sessions preisgibt.
 */
export const session = pgTable(
  'session',
  {
    id: id(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    /** Token für den CSRF-Schutz schreibender Anfragen. */
    csrfToken: text('csrf_token').notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('session_account_idx').on(t.accountId),
    index('session_expires_idx').on(t.expiresAt),
  ],
);

// --- Communities -------------------------------------------------------------

export const community = pgTable('community', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  defaultLocale: locale('default_locale').notNull().default('de'),
  createdAt: createdAt(),
});

/** Discord-Server, Discord-Kanäle und Twitch-Kanäle einer Community. */
export const communityChannel = pgTable(
  'community_channel',
  {
    id: id(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => community.id, { onDelete: 'cascade' }),
    kind: channelKind('kind').notNull(),
    externalId: text('external_id').notNull(),
    /** Übergeordnete Plattform-ID, z. B. der Discord-Server eines Kanals. */
    parentExternalId: text('parent_external_id'),
    xpEnabled: boolean('xp_enabled').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('community_channel_external_idx').on(t.kind, t.externalId),
    index('community_channel_community_idx').on(t.communityId),
  ],
);

export const communityMember = pgTable(
  'community_member',
  {
    communityId: uuid('community_id')
      .notNull()
      .references(() => community.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    role: communityRole('role').notNull().default('member'),
    /** Heimat-Community für Ranglisten; genau eine pro Account. */
    isHome: boolean('is_home').notNull().default(false),
    /** Letzter Heimatwechsel (höchstens alle 14 Tage). */
    homeChangedAt: timestamp('home_changed_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.communityId, t.accountId] }),
    index('community_member_account_idx').on(t.accountId),
    uniqueIndex('community_member_single_home_idx')
      .on(t.accountId)
      .where(sql`${t.isHome}`),
  ],
);

// --- Charakter ---------------------------------------------------------------

/** Ein Charakter pro Account und Season; zu Season-Beginn starten alle bei 0. */
export const character = pgTable(
  'character',
  {
    id: id(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    class: characterClass('class').notNull().default('bruiser'),
    level: integer('level').notNull().default(1),
    xp: bigint('xp', { mode: 'number' }).notNull().default(0),
    /** Frei verteilte Attributspunkte (ohne festen Klassen-Zuwachs); freie Punkte werden abgeleitet. */
    attrStr: integer('attr_str').notNull().default(0),
    attrDex: integer('attr_dex').notNull().default(0),
    attrInt: integer('attr_int').notNull().default(0),
    attrCon: integer('attr_con').notNull().default(0),
    renamedAt: timestamp('renamed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('character_account_season_idx').on(t.accountId, t.seasonId),
    // Namen sind pro Season eindeutig, unabhängig von Groß- und Kleinschreibung.
    uniqueIndex('character_season_name_idx').on(t.seasonId, sql`lower(${t.name})`),
    check('character_name_length_check', sql`char_length(${t.name}) BETWEEN 3 AND 20`),
    check('character_level_check', sql`${t.level} >= 1`),
    check(
      'character_points_check',
      sql`${t.xp} >= 0 AND ${t.attrStr} >= 0 AND ${t.attrDex} >= 0 AND ${t.attrInt} >= 0 AND ${t.attrCon} >= 0`,
    ),
  ],
);

/**
 * Loadout je Charakter und Klasse: aktive Fähigkeiten und Taktikregeln in Reihenfolge.
 * Beim Klassenwechsel bleibt das Loadout der anderen Klasse erhalten. Mehrere benannte
 * Presets pro Klasse folgen später.
 */
export const loadout = pgTable(
  'loadout',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => character.id, { onDelete: 'cascade' }),
    classId: characterClass('class_id').notNull(),
    abilities: jsonb('abilities').$type<string[]>().notNull(),
    tactics: jsonb('tactics').$type<TacticRule[]>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('loadout_character_class_idx').on(t.characterId, t.classId)],
);

// --- Kämpfe ------------------------------------------------------------------

/** Binärdaten (z. B. das gzip-komprimierte Event-Log). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const fightKind = pgEnum('fight_kind', ['pvp_rated', 'pvp_friendly']);
export const fightEndReason = pgEnum('fight_end_reason', ['knockout', 'timeout']);

/**
 * Ein gespeicherter Kampf. Seed, Versionen und Momentaufnahmen (input) reichen, um ihn exakt
 * nachzurechnen; das komprimierte Event-Log macht Replays schnell und bleibt auch nach
 * Engine-Updates abspielbar.
 */
export const fight = pgTable(
  'fight',
  {
    id: id(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    kind: fightKind('kind').notNull(),
    engineVersion: integer('engine_version').notNull(),
    configVersion: integer('config_version').notNull(),
    seed: text('seed').notNull(),
    /** Momentaufnahmen aller Teams und ggf. abweichende Regeln. */
    input: jsonb('input')
      .$type<Omit<BattleInput, 'engineVersion' | 'configVersion' | 'seed'>>()
      .notNull(),
    events: bytea('events').notNull(),
    logHash: text('log_hash').notNull(),
    winnerTeam: integer('winner_team'),
    reason: fightEndReason('reason').notNull(),
    rounds: integer('rounds').notNull(),
    /** Spieltag (Europe/Berlin, laut Clock-Service) für Tageslimits. */
    rewardDay: text('reward_day').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('fight_season_created_idx').on(t.seasonId, t.createdAt)],
);

export const fightParticipant = pgTable(
  'fight_participant',
  {
    fightId: uuid('fight_id')
      .notNull()
      .references(() => fight.id, { onDelete: 'cascade' }),
    team: integer('team').notNull(),
    slot: integer('slot').notNull(),
    /** null für Monster oder gelöschte Charaktere (Kampfdaten bleiben anonym erhalten). */
    characterId: uuid('character_id').references(() => character.id, { onDelete: 'set null' }),
    /** Hat den Kampf ausgelöst. */
    initiator: boolean('initiator').notNull().default(false),
    won: boolean('won').notNull(),
    /** Zählt für das Tageslimit belohnter Kämpfe. */
    rewarded: boolean('rewarded').notNull().default(false),
    xpAwarded: integer('xp_awarded').notNull().default(0),
    /** Gegner-Charakter bei 1v1, für die Abnahme gegen denselben Gegner. */
    opponentCharacterId: uuid('opponent_character_id'),
  },
  (t) => [
    primaryKey({ columns: [t.fightId, t.team, t.slot] }),
    index('fight_participant_character_idx').on(t.characterId),
  ],
);
