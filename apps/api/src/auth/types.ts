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
   * Identität neu; sonst werden Anzeigename, Avatar und letzter Login aktualisiert.
   * @returns die Account-ID
   */
  loginWithIdentity(profile: ExternalProfile, now: Date): Promise<string>;
  findProfile(accountId: string): Promise<MeProfile | null>;
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
  authorizeUrl(state: string): string;
  /** Tauscht den Code gegen ein Token und lädt das Profil. */
  fetchProfile(code: string): Promise<ExternalProfile>;
}
