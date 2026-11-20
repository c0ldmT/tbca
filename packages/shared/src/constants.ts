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
export const IDENTITY_PROVIDERS = ['discord', 'twitch'] as const;
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
