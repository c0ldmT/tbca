import { z } from 'zod';

import { globalRoleSchema, identityProviderSchema, localeSchema } from './schemas.js';

/** GET /api/health */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: z.enum(['up', 'down']),
  }),
  engineVersion: z.number().int(),
  /** Spielzeit laut Clock-Service (ISO 8601). */
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** GET /api/auth/me */
export const meResponseSchema = z.object({
  account: z.object({
    id: z.uuid(),
    globalRole: globalRoleSchema,
    locale: localeSchema.nullable(),
  }),
  identities: z.array(
    z.object({
      provider: identityProviderSchema,
      displayName: z.string(),
      avatarUrl: z.url().nullable(),
    }),
  ),
  /** Für schreibende Anfragen im Header CSRF_HEADER mitsenden. */
  csrfToken: z.string().min(16),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** Einheitliches Fehlerformat der API. */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
