import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/**
 * Umgebungsvariablen der API, beim Start geprüft. Dokumentiert in .env.example.
 * Discord ist optional, damit die API auch ohne angelegte Developer-App startet.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
      .default('info'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    /** Hinter Caddy: X-Forwarded-* vertrauen. */
    TRUST_PROXY: bool.default(false),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DB_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(100).default(10),
    /** Öffentliche Adresse der Website; Ziel nach dem Login und erlaubter Origin. */
    WEB_ORIGIN: z.url().transform((u) => u.replace(/\/+$/, '')),
    COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET muss mindestens 32 Zeichen haben'),
    /** Secure-Flag für Cookies; Standard: nur in Produktion. */
    COOKIE_SECURE: bool.optional(),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    /** Zeitzone für Spieltage und Tageslimits. */
    GAME_TIMEZONE: z
      .string()
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, 'Unbekannte Zeitzone')
      .default('Europe/Berlin'),
    DISCORD_CLIENT_ID: z.string().optional(),
    DISCORD_CLIENT_SECRET: z.string().optional(),
    DISCORD_REDIRECT_URI: z.url().optional(),
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    DISCORD_REDIRECT_URI: env.DISCORD_REDIRECT_URI ?? `${env.WEB_ORIGIN}/api/auth/discord/callback`,
  }));

export type Env = z.infer<typeof envSchema>;

/** Liest und prüft die Umgebung; bricht mit einer verständlichen Meldung ab. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Leere Werte (z. B. DISCORD_CLIENT_ID=) gelten als nicht gesetzt.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Ungültige Umgebung:\n${issues.join('\n')}`);
  }
  return result.data;
}

export function isDiscordConfigured(env: Env): boolean {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);
}
