/**
 * Konstanten ohne Laufzeitabhängigkeiten. Die Website importiert sie über
 * `@tbca/shared/constants`, damit Zod nicht im Browser-Bundle landet.
 */

/** Unterstützte Sprachen; Englisch ist der Rückfall für fehlende Übersetzungen. */
export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'de';
export const FALLBACK_LOCALE: Locale = 'en';

/** Plattformen, über die sich Spieler anmelden bzw. Identitäten verknüpfen. */
/** `dev`: lokale Test-Anmeldung ohne Discord (DEV_LOGIN). */
export const IDENTITY_PROVIDERS = ['discord', 'twitch', 'dev'] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

export const GLOBAL_ROLES = ['player', 'superadmin'] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

/** Header, in dem schreibende Anfragen das CSRF-Token mitschicken. */
export const CSRF_HEADER = 'x-csrf-token';

/** Team-Logos (Auswahl), Fokusziele der Team-Taktik und Größe. */
export const TEAM_LOGOS = [
  'wolf',
  'halo',
  'skull',
  'bolt',
  'eye',
  'blade',
  'chip',
  'crown',
] as const;
export const TEAM_FOCUS = ['threat', 'lowest_hp', 'highest_hp', 'healer', 'random'] as const;
export const TEAM_MAX_MEMBERS = 6;

/** Tageslimits, die der Admin zurücksetzen kann. */
export const DAILY_LIMIT_KINDS = ['dungeon', 'fights', 'passive'] as const;
export type DailyLimitKind = (typeof DAILY_LIMIT_KINDS)[number];

/** Hintergrund-Jobs, die der Admin sofort auslösen kann. */
export const SEASON_JOB_IDS = [
  'season-stats',
  'flush-passive-xp',
  'expire-dungeon-runs',
  'end-dungeon-runs',
  'bot-agents',
  'league-tick',
] as const;
export type SeasonJobId = (typeof SEASON_JOB_IDS)[number];

/** Obergrenze der Kämpfe je Paarung bei der Team-Simulation (3v3: 190 Paarungen). */
export const SIM_TEAM_MAX_SAMPLES = 60;
