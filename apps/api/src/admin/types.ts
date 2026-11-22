export interface AuditEntry {
  id: string;
  actorAccountId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  data: Record<string, unknown>;
  createdAt: Date;
}

export interface AccountOverview {
  accountId: string;
  identities: { provider: string; displayName: string; providerUserId: string }[];
  character: { id: string; name: string; level: number; xp: number } | null;
  globalRole: 'player' | 'superadmin';
  isBot: boolean;
  bannedAt: Date | null;
  bannedReason: string | null;
}

export interface AdminRepository {
  audit(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void>;
  auditLog(limit: number): Promise<AuditEntry[]>;
  /** Accounts nach Anzeige- oder Charaktername in der Season. */
  searchAccounts(seasonId: string, query: string, limit: number): Promise<AccountOverview[]>;
  setBan(accountId: string, reason: string | null): Promise<boolean>;
  setProgress(characterId: string, xp: number, level: number): Promise<void>;
  /** Sessions eines Accounts beenden (z. B. bei Sperre). */
  revokeSessions(accountId: string): Promise<void>;
}
