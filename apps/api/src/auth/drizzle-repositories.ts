import { account, identity, session, type Database } from '@tbca/db';
import { and, asc, eq, gt, sql } from 'drizzle-orm';

import type {
  AccountRepository,
  ExternalProfile,
  MeProfile,
  SessionStore,
  StoredSession,
} from './types.js';

export class DrizzleAccountRepository implements AccountRepository {
  constructor(private readonly db: Database) {}

  async loginWithIdentity(profile: ExternalProfile, now: Date | null): Promise<string> {
    const seen = now ? { lastLoginAt: now } : {};
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .update(identity)
        .set({ displayName: profile.displayName, avatarUrl: profile.avatarUrl, ...seen })
        .where(
          and(
            eq(identity.provider, profile.provider),
            eq(identity.providerUserId, profile.providerUserId),
          ),
        )
        .returning({ accountId: identity.accountId });
      if (existing) return existing.accountId;

      // Neue Identität: Account anlegen. Kommt ein paralleler Erst-Login zuvor, greift die
      // Eindeutigkeit von (provider, provider_user_id) und der neue Account wird verworfen.
      const [created] = await tx.insert(account).values({}).returning({ id: account.id });
      const [linked] = await tx
        .insert(identity)
        .values({ ...profile, accountId: created!.id, ...seen })
        .onConflictDoUpdate({
          target: [identity.provider, identity.providerUserId],
          set: { displayName: profile.displayName, avatarUrl: profile.avatarUrl, ...seen },
        })
        .returning({ accountId: identity.accountId });
      if (linked!.accountId !== created!.id) {
        await tx.delete(account).where(eq(account.id, created!.id));
      }
      return linked!.accountId;
    });
  }

  async findAccountId(
    provider: ExternalProfile['provider'],
    providerUserId: string,
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ accountId: identity.accountId })
      .from(identity)
      .where(and(eq(identity.provider, provider), eq(identity.providerUserId, providerUserId)));
    return row?.accountId ?? null;
  }

  async findProfile(accountId: string): Promise<MeProfile | null> {
    const [acc] = await this.db.select().from(account).where(eq(account.id, accountId));
    if (!acc) return null;
    const identities = await this.db
      .select({
        provider: identity.provider,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
      })
      .from(identity)
      .where(eq(identity.accountId, accountId))
      .orderBy(asc(identity.createdAt));
    return {
      account: { id: acc.id, globalRole: acc.globalRole, locale: acc.locale },
      identities,
    };
  }
}

const sessionColumns = {
  id: session.id,
  accountId: session.accountId,
  csrfToken: session.csrfToken,
  expiresAt: session.expiresAt,
  lastSeenAt: session.lastSeenAt,
};

export class DrizzleSessionStore implements SessionStore {
  constructor(private readonly db: Database) {}

  async create(input: {
    accountId: string;
    tokenHash: string;
    csrfToken: string;
    expiresAt: Date;
    now: Date;
  }): Promise<StoredSession> {
    const [row] = await this.db
      .insert(session)
      .values({
        accountId: input.accountId,
        tokenHash: input.tokenHash,
        csrfToken: input.csrfToken,
        expiresAt: input.expiresAt,
        createdAt: input.now,
        lastSeenAt: input.now,
      })
      .returning(sessionColumns);
    return row!;
  }

  async findValid(tokenHash: string, now: Date): Promise<StoredSession | null> {
    const [row] = await this.db
      .select(sessionColumns)
      .from(session)
      .where(and(eq(session.tokenHash, tokenHash), gt(session.expiresAt, now)));
    return row ?? null;
  }

  async extend(id: string, now: Date, expiresAt: Date): Promise<void> {
    await this.db.update(session).set({ lastSeenAt: now, expiresAt }).where(eq(session.id, id));
  }

  async delete(tokenHash: string): Promise<void> {
    await this.db.delete(session).where(eq(session.tokenHash, tokenHash));
  }

  /** Räumt abgelaufene Sessions auf (später als Worker-Job). */
  async deleteExpired(now: Date): Promise<number> {
    const result = await this.db.delete(session).where(sql`${session.expiresAt} <= ${now}`);
    return result.rowCount ?? 0;
  }
}
