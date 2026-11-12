/**
 * Drizzle-Grundschema (Spezifikation, Abschnitt 16).
 *
 * Konventionen:
 * - Primärschlüssel sind UUIDv7 (zeitlich sortierbar), erzeugt in der Anwendung.
 * - Zeitstempel sind `timestamptz`.
 * - Spielbezogene Tabellen tragen eine `season_id`; Spielwerte liegen versioniert in
 *   `config_version` und hängen an einer Season.
 */
import type {
  BattleInput,
  BattleRules,
  CombatantSnapshot,
  TargetSelector,
  EquipSlot,
  GameConfig,
  ItemData,
  TacticRule,
} from '@tbca/game-core';
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
/** `dev`: lokale Test-Anmeldung ohne Discord. */
export const identityProvider = pgEnum('identity_provider', ['discord', 'twitch', 'dev']);
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
    /**
     * Anker der Spieluhr: Zu `clockAnchorReal` (Echtzeit) war es `clockAnchorGame` (Spielzeit).
     * Ohne Anker läuft die Spielzeit gleich der Echtzeit. Vorspulen verschiebt den Spielzeit-Anker.
     */
    clockAnchorReal: timestamp('clock_anchor_real', { withTimezone: true }),
    clockAnchorGame: timestamp('clock_anchor_game', { withTimezone: true }),
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
  /** Computergesteuerter Gegner ohne Identität; kann sich nicht anmelden. */
  isBot: boolean('is_bot').notNull().default(false),
  /** Gesperrt seit; gesperrte Accounts können weder spielen noch Bots nutzen. */
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  bannedReason: text('banned_reason'),
  /** Verhalten eines Bot-Spielers (Abschnitt 14), z. B. casual, active, farmer. */
  botAgent: text('bot_agent'),
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
    /** Kanal für Liga-Ankündigungen (höchstens einer je Server). */
    leagueNews: boolean('league_news').notNull().default(false),
    /** Bis zu diesem Spielzeitpunkt wurde in diesem Kanal angekündigt. */
    leagueAnnouncedUntil: timestamp('league_announced_until', { withTimezone: true }),
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

export const fightKind = pgEnum('fight_kind', [
  'pvp_rated',
  'pvp_friendly',
  'training',
  'dungeon',
  'team_rated',
  'team_friendly',
  'league',
]);
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
    creditsAwarded: integer('credits_awarded').notNull().default(0),
    /** Gegner-Charakter bei 1v1, für die Abnahme gegen denselben Gegner. */
    opponentCharacterId: uuid('opponent_character_id'),
    /** Gegner-Team bei Team-Herausforderungen, ebenso für die Abnahme. */
    opponentTeamId: uuid('opponent_team_id'),
  },
  (t) => [
    primaryKey({ columns: [t.fightId, t.team, t.slot] }),
    index('fight_participant_character_idx').on(t.characterId),
  ],
);

// --- Credits (Abschnitt 12) ------------------------------------------------

/** Eine Buchung; ihre Zeilen (credit_entry) summieren sich zu 0. */
export const creditTransaction = pgTable(
  'credit_transaction',
  {
    id: id(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    /** Art, z. B. pvp_reward, respec, shop_purchase. */
    kind: text('kind').notNull(),
    /** Bezug, z. B. die Kampf-ID. */
    refId: uuid('ref_id'),
    createdAt: createdAt(),
  },
  (t) => [index('credit_transaction_season_kind_idx').on(t.seasonId, t.kind, t.createdAt)],
);

export const creditEntry = pgTable(
  'credit_entry',
  {
    id: id(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => creditTransaction.id, { onDelete: 'cascade' }),
    seasonId: uuid('season_id').notNull(),
    /** Spielerkonto oder … */
    accountId: uuid('account_id').references(() => account.id, { onDelete: 'set null' }),
    /** … Systemkonto (Quelle oder Senke). */
    systemAccount: text('system_account'),
    amount: bigint('amount', { mode: 'number' }).notNull(),
  },
  (t) => [
    index('credit_entry_account_idx').on(t.seasonId, t.accountId),
    index('credit_entry_transaction_idx').on(t.transactionId),
  ],
);

/** Saldo je Spieler und Season als Cache des Ledgers; nie negativ. */
export const wallet = pgTable(
  'wallet',
  {
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    balance: bigint('balance', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.seasonId, t.accountId] }),
    check('wallet_balance_check', sql`${t.balance} >= 0`),
  ],
);

// --- Items (Abschnitt 7) -----------------------------------------------------

export const itemBinding = pgEnum('item_binding', ['account', 'tradeable']);
/**
 * Plätze wie EQUIP_SLOTS in game-core. Hier ausgeschrieben, weil drizzle-kit das Schema ohne
 * Laufzeit-Import aus anderen Paketen laden muss; ein Test prüft die Übereinstimmung.
 */
export const EQUIP_SLOT_VALUES = [
  'head',
  'torso',
  'legs',
  'feet',
  'hands',
  'main_hand',
  'off_hand',
  'implant_1',
  'implant_2',
  'core_implant',
] as const satisfies readonly EquipSlot[];
export const equipSlot = pgEnum('equip_slot', EQUIP_SLOT_VALUES);

/**
 * Ein gewürfeltes Item im Besitz eines Accounts in einer Season. Die Werte (Basis, Affixe)
 * stehen als JSON in `data`, Budget und Rarität zusätzlich als Spalten für Auswertungen.
 * Bis zur Handelsphase sind alle Items account-gebunden.
 */
export const itemInstance = pgTable(
  'item_instance',
  {
    id: id(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    templateId: text('template_id').notNull(),
    itemLevel: integer('item_level').notNull(),
    rarity: integer('rarity').notNull(),
    budget: integer('budget').notNull(),
    data: jsonb('data').$type<ItemData>().notNull(),
    binding: itemBinding('binding').notNull().default('account'),
    /** Herkunft, z. B. starter, test, dungeon. */
    source: text('source').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('item_instance_owner_idx').on(t.accountId, t.seasonId),
    check('item_instance_values_check', sql`${t.itemLevel} >= 1 AND ${t.rarity} >= 1`),
  ],
);

/** Ausgerüstete Items je Charakter und Platz; ein Item steckt höchstens in einem Platz. */
export const equipment = pgTable(
  'equipment',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => character.id, { onDelete: 'cascade' }),
    slot: equipSlot('slot').notNull(),
    itemId: uuid('item_id')
      .notNull()
      .unique()
      .references(() => itemInstance.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.slot] })],
);

// --- Materialien, Verbrauchsgüter, Shop --------------------------------------

/** Stapel von Materialien und Verbrauchsgütern je Account und Season; nie negativ. */
export const materialStack = pgTable(
  'material_stack',
  {
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    /** z. B. scrap, circuits, quantum_cores, backup_chip, heal_injector */
    stackId: text('stack_id').notNull(),
    quantity: integer('quantity').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.seasonId, t.accountId, t.stackId] }),
    check('material_stack_quantity_check', sql`${t.quantity} >= 0`),
  ],
);

/** Gekaufte Angebote der täglichen Rotation; jedes nur einmal pro Tag. */
export const shopPurchase = pgTable(
  'shop_purchase',
  {
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    day: text('day').notNull(),
    offerId: text('offer_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.accountId, t.day, t.offerId] })],
);

// --- Dungeon (Abschnitt 8) ---------------------------------------------------

export const dungeonRunStatus = pgEnum('dungeon_run_status', [
  'active',
  'left',
  'timed_out',
  'defeated',
  'saved',
]);

/** Run-Loot bleibt vorgemerkt, bis der Charakter den Dungeon verlässt. */
export interface DungeonLoot {
  items: ItemData[];
  credits: number;
}

/**
 * Ein Dungeon-Run. Die Momentaufnahme des Charakters wird beim Start eingefroren; HP und Energie
 * werden zwischen den Etagen fortgeschrieben.
 */
export const dungeonRun = pgTable(
  'dungeon_run',
  {
    id: id(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => character.id, { onDelete: 'cascade' }),
    status: dungeonRunStatus('status').notNull().default('active'),
    /** Zuletzt gewonnene Etage (0 = noch keine). */
    floor: integer('floor').notNull().default(0),
    seed: text('seed').notNull(),
    snapshot: jsonb('snapshot').$type<CombatantSnapshot>().notNull(),
    hp: integer('hp').notNull(),
    energy: integer('energy').notNull(),
    injectors: integer('injectors').notNull().default(0),
    backupChip: boolean('backup_chip').notNull().default(false),
    loot: jsonb('loot').$type<DungeonLoot>().notNull(),
    xpGained: integer('xp_gained').notNull().default(0),
    lastFightId: uuid('last_fight_id'),
    rewardDay: text('reward_day').notNull(),
    /** Spielzeit der letzten Aktion, für die automatische Entscheidung nach 10 Minuten. */
    lastActionAt: timestamp('last_action_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    index('dungeon_run_character_idx').on(t.characterId, t.rewardDay),
    uniqueIndex('dungeon_run_single_active_idx')
      .on(t.characterId)
      .where(sql`${t.status} = 'active'`),
  ],
);

// --- Progression (Abschnitt 11) ---------------------------------------------

/**
 * Passive Tages-XP je Account und Season über alle Communities und Plattformen. Nur Zähler,
 * keine Nachrichteninhalte.
 */
export const xpLedgerDaily = pgTable(
  'xp_ledger_daily',
  {
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    day: text('day').notNull(),
    /** Ungedeckelte Summe (bis zur harten Schwelle). */
    passiveRaw: integer('passive_raw').notNull().default(0),
    passiveAwarded: integer('passive_awarded').notNull().default(0),
    messages: integer('messages').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.accountId, t.day] })],
);

/**
 * Vom Admin zurückgesetzte Tageslimits: Dungeon-Runs bzw. belohnte Kämpfe des Tages `day`
 * zählen nur noch, wenn sie nach dem jüngsten passenden Eintrag entstanden sind. Ohne
 * Charakter gilt der Eintrag für alle Charaktere der Season.
 */
export const dailyReset = pgTable(
  'daily_reset',
  {
    id: id(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id').references(() => character.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'dungeon' | 'fights'>().notNull(),
    day: text('day').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('daily_reset_lookup_idx').on(t.seasonId, t.day, t.kind),
    check('daily_reset_kind_check', sql`${t.kind} IN ('dungeon', 'fights')`),
  ],
);

// --- Teams (Abschnitt 9) -------------------------------------------------------

/** Feste Gruppe mit bis zu 6 Mitgliedern, gebunden an eine Community. */
export const team = pgTable(
  'team',
  {
    id: id(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => community.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tag: text('tag').notNull(),
    /** Logo aus einer festen Auswahl. */
    logo: text('logo').notNull(),
    captainAccountId: uuid('captain_account_id').references(() => account.id, {
      onDelete: 'set null',
    }),
    /** Einladungscode zum Beitreten. */
    joinCode: text('join_code').notNull().unique(),
    /** Team-Taktik: Fokusziel. */
    focus: text('focus').$type<TargetSelector>().notNull().default('threat'),
    /** Standard-Aufstellungen (Account-IDs) für Herausforderungen gegen das Team. */
    lineup2: jsonb('lineup2').$type<string[]>().notNull().default([]),
    lineup3: jsonb('lineup3').$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('team_name_idx').on(sql`lower(${t.name})`),
    uniqueIndex('team_tag_idx').on(sql`lower(${t.tag})`),
    check('team_tag_check', sql`char_length(${t.tag}) BETWEEN 2 AND 5`),
  ],
);

export const teamMember = pgTable(
  'team_member',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    /** Kopie der Team-Community: je Community höchstens ein Team pro Account. */
    communityId: uuid('community_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.accountId] }),
    uniqueIndex('team_member_one_per_community_idx').on(t.accountId, t.communityId),
  ],
);

// --- Admin (Abschnitt 13) -----------------------------------------------------

/** Jede Admin-Aktion wird protokolliert: wer, was, an wem, mit welchen Daten. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorAccountId: uuid('actor_account_id').references(() => account.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
);

// --- Rating und Liga (Abschnitt 9) ---------------------------------------------

/**
 * Glicko-2-Rating eines Charakters (je Season, weil Charaktere je Season existieren). Wird aus
 * allen gewerteten Kämpfen fortgeschrieben; `games` zählt die Platzierung.
 */
export const rating = pgTable(
  'rating',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => character.id, { onDelete: 'cascade' }),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    rating: doublePrecision('rating').notNull(),
    rd: doublePrecision('rd').notNull(),
    volatility: doublePrecision('volatility').notNull(),
    games: integer('games').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    /** Für die nächsten Liga-Zyklen angemeldet. */
    leagueJoined: boolean('league_joined').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rating_season_rating_idx').on(t.seasonId, t.rating)],
);

/** Ein Liga-Zyklus: jede Division spielt Round Robin, ein Spieltag pro Tag. */
export const leagueCycle = pgTable(
  'league_cycle',
  {
    id: id(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    status: text('status').$type<'active' | 'finished'>().notNull().default('active'),
    /** Spielzeit des ersten und letzten Spieltags. */
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('league_cycle_season_number_idx').on(t.seasonId, t.number),
    check('league_cycle_status_check', sql`${t.status} IN ('active', 'finished')`),
  ],
);

/** Teilnehmer eines Zyklus mit Division (0 = oberste) und Abschluss. */
export const leagueMember = pgTable(
  'league_member',
  {
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => leagueCycle.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => character.id, { onDelete: 'cascade' }),
    division: integer('division').notNull(),
    ratingAtStart: doublePrecision('rating_at_start').notNull(),
    /** Gesetzt am Zyklusende. */
    place: integer('place'),
    movement: text('movement').$type<'up' | 'down' | 'stay'>(),
  },
  (t) => [
    primaryKey({ columns: [t.cycleId, t.characterId] }),
    index('league_member_character_idx').on(t.characterId),
  ],
);

/**
 * Eine Paarung eines Spieltags. Zum Lock werden die Momentaufnahmen beider Seiten gespeichert,
 * zum Spieltag wird mit ihnen gekämpft. `b` fehlt bei spielfrei.
 */
export const leagueMatch = pgTable(
  'league_match',
  {
    id: id(),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => leagueCycle.id, { onDelete: 'cascade' }),
    division: integer('division').notNull(),
    matchday: integer('matchday').notNull(),
    lockAt: timestamp('lock_at', { withTimezone: true }).notNull(),
    playAt: timestamp('play_at', { withTimezone: true }).notNull(),
    aCharacterId: uuid('a_character_id').references(() => character.id, { onDelete: 'set null' }),
    bCharacterId: uuid('b_character_id').references(() => character.id, { onDelete: 'set null' }),
    status: text('status').$type<'scheduled' | 'locked' | 'played' | 'bye'>().notNull(),
    snapshots: jsonb('snapshots').$type<CombatantSnapshot[]>(),
    fightId: uuid('fight_id').references(() => fight.id, { onDelete: 'set null' }),
    winnerCharacterId: uuid('winner_character_id'),
    draw: boolean('draw').notNull().default(false),
  },
  (t) => [
    index('league_match_cycle_idx').on(t.cycleId, t.division, t.matchday),
    index('league_match_due_idx').on(t.status, t.lockAt, t.playAt),
    check(
      'league_match_status_check',
      sql`${t.status} IN ('scheduled', 'locked', 'played', 'bye')`,
    ),
  ],
);
