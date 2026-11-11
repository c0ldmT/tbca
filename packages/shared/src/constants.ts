import { z } from 'zod';

/** Unterstützte Sprachen; Englisch ist der Rückfall für fehlende Übersetzungen. */
export const LOCALES = ['de', 'en'] as const;
export const DEFAULT_LOCALE = 'de' satisfies Locale;
export const FALLBACK_LOCALE = 'en' satisfies Locale;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

/** Plattformen, über die sich Spieler anmelden bzw. Identitäten verknüpfen. */
export const IDENTITY_PROVIDERS = ['discord', 'twitch'] as const;
export const identityProviderSchema = z.enum(IDENTITY_PROVIDERS);
export type IdentityProvider = z.infer<typeof identityProviderSchema>;

export const GLOBAL_ROLES = ['player', 'superadmin'] as const;
export const globalRoleSchema = z.enum(GLOBAL_ROLES);
export type GlobalRole = z.infer<typeof globalRoleSchema>;

/** Header, in dem schreibende Anfragen das CSRF-Token mitschicken. */
export const CSRF_HEADER = 'x-csrf-token';
