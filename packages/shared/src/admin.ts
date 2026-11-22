import { z } from 'zod';

const DAY = 24 * 60 * 60 * 1000;

/** PUT /api/admin/time – Zeitfaktor (1–1000) und/oder Vorspulen (bis 30 Tage am Stück). */
export const adminTimeSchema = z
  .object({
    factor: z.number().min(1).max(1000).optional(),
    advanceMs: z
      .number()
      .int()
      .min(0)
      .max(30 * DAY)
      .optional(),
  })
  .refine(
    (v) => v.factor !== undefined || v.advanceMs !== undefined,
    'factor oder advanceMs angeben',
  );

export const adminBanSchema = z.object({ reason: z.string().trim().min(3).max(200).nullable() });
export const adminAmountSchema = z.object({
  amount: z
    .number()
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((v) => v !== 0),
  reason: z.string().trim().min(3).max(200),
});

export interface AdminTimeView {
  season: { id: string; name: string; isTest: boolean };
  realNow: string;
  gameNow: string;
  factor: number;
}

export interface AdminAccountView {
  accountId: string;
  identities: { provider: string; displayName: string; providerUserId: string }[];
  character: { id: string; name: string; level: number; xp: number } | null;
  globalRole: 'player' | 'superadmin';
  isBot: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
}

export interface AdminAuditView {
  id: string;
  actorAccountId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}
