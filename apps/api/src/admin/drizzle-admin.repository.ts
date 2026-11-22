import { account, auditLog, character, identity, session, type Database } from '@tbca/db';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';

import type { AccountOverview, AdminRepository, AuditEntry } from './types.js';

export class DrizzleAdminRepository implements AdminRepository {
  constructor(private readonly db: Database) {}

  async audit(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void> {
    await this.db.insert(auditLog).values(entry);
  }

  async auditLog(limit: number): Promise<AuditEntry[]> {
    return this.db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
  }

  async searchAccounts(seasonId: string, query: string, limit: number): Promise<AccountOverview[]> {
    const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const byIdentity = this.db
      .select({ id: identity.accountId })
      .from(identity)
      .where(or(ilike(identity.displayName, pattern), eq(identity.providerUserId, query)));
    const byCharacter = this.db
      .select({ id: character.accountId })
      .from(character)
      .where(and(eq(character.seasonId, seasonId), ilike(character.name, pattern)));
    const accounts = await this.db
      .select()
      .from(account)
      .where(or(inArray(account.id, byIdentity), inArray(account.id, byCharacter)))
      .limit(limit);
    if (accounts.length === 0) return [];
    const ids = accounts.map((a) => a.id);
    const [identities, characters] = await Promise.all([
      this.db.select().from(identity).where(inArray(identity.accountId, ids)),
      this.db
        .select()
        .from(character)
        .where(and(eq(character.seasonId, seasonId), inArray(character.accountId, ids))),
    ]);
    return accounts.map((a) => {
      const c = characters.find((x) => x.accountId === a.id);
      return {
        accountId: a.id,
        identities: identities
          .filter((i) => i.accountId === a.id)
          .map((i) => ({
            provider: i.provider,
            displayName: i.displayName,
            providerUserId: i.providerUserId,
          })),
        character: c ? { id: c.id, name: c.name, level: c.level, xp: c.xp } : null,
        globalRole: a.globalRole,
        isBot: a.isBot,
        bannedAt: a.bannedAt,
        bannedReason: a.bannedReason,
      };
    });
  }

  async setBan(accountId: string, reason: string | null): Promise<boolean> {
    const rows = await this.db
      .update(account)
      .set({ bannedAt: reason === null ? null : new Date(), bannedReason: reason })
      .where(eq(account.id, accountId))
      .returning({ id: account.id });
    return rows.length > 0;
  }

  async setProgress(characterId: string, xp: number, level: number): Promise<void> {
    await this.db.update(character).set({ xp, level }).where(eq(character.id, characterId));
  }

  async revokeSessions(accountId: string): Promise<void> {
    await this.db.delete(session).where(eq(session.accountId, accountId));
  }
}
