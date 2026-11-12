import type { IdentityProvider, MeResponse } from '@tbca/shared';

/** Profil einer Plattform nach erfolgreichem OAuth-Login. */
export interface ExternalProfile {
  provider: IdentityProvider;
  providerUserId: string;
  displayName: string;
  avatarUrl: string | null;
}

export type MeProfile = Omit<MeResponse, 'csrfToken'>;

export interface AccountRepository {
  /**
   * Meldet eine Plattform-Identität an. Existiert sie noch nicht, entstehen Account und
   * Identität neu (Schatten-Account, wenn es über einen Chat-Command geschieht); sonst werden
   * Anzeigename, Avatar und – bei `now` – der letzte Login aktualisiert.
   * @returns die Account-ID
   */
  loginWithIdentity(profile: ExternalProfile, now: Date | null): Promise<string>;
  /** Account zu einer Plattform-Identität oder null. */
  findAccountId(
    provider: ExternalProfile['provider'],
    providerUserId: string,
  ): Promise<string | null>;
  /** Plattform-Nutzer-ID eines Accounts (z. B. für Discord-Erwähnungen) oder null. */
  providerUserId(accountId: string, provider: ExternalProfile['provider']): Promise<string | null>;
  findProfile(accountId: string): Promise<MeProfile | null>;
  /** Rolle und Sperre, für Guards bei jeder Anfrage. */
  status(
    accountId: string,
  ): Promise<{ globalRole: 'player' | 'superadmin'; banned: boolean } | null>;
}

export interface StoredSession {
  id: string;
  accountId: string;
  csrfToken: string;
  expiresAt: Date;
  lastSeenAt: Date;
}

export interface SessionStore {
  create(session: {
    accountId: string;
    tokenHash: string;
    csrfToken: string;
    expiresAt: Date;
    now: Date;
  }): Promise<StoredSession>;
  /** Nur nicht abgelaufene Sessions. */
  findValid(tokenHash: string, now: Date): Promise<StoredSession | null>;
  extend(id: string, now: Date, expiresAt: Date): Promise<void>;
  delete(tokenHash: string): Promise<void>;
}

export interface DiscordOAuth {
  /** `redirectUri` muss in der Discord-App eingetragen sein. */
  authorizeUrl(state: string, redirectUri: string): string;
  /** Tauscht den Code gegen ein Token und lädt das Profil (gleiche `redirectUri` wie oben). */
  fetchProfile(code: string, redirectUri: string): Promise<ExternalProfile>;
}
