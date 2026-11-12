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
    /**
     * Weitere Adressen, unter denen die Website erreichbar ist (Komma-getrennt), z. B.
     * http://192.168.178.20:4200 für Tests im Heimnetz. Login, Rücksprung und CSRF-Prüfung
     * gelten dann für jede dieser Adressen.
     */
    WEB_EXTRA_ORIGINS: z
      .string()
      .optional()
      .transform((raw, ctx) => {
        const origins: string[] = [];
        for (const item of (raw ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)) {
          try {
            const url = new URL(item);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
            origins.push(url.origin);
          } catch {
            ctx.addIssue({ code: 'custom', message: `Keine gültige Adresse: ${item}` });
            return z.NEVER;
          }
        }
        return origins;
      }),
    /** Anmeldung ohne Discord mit frei gewähltem Namen – nur für lokale Tests. */
    DEV_LOGIN: bool.default(false),
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
    /** Valkey für Cooldowns, Rate-Limits und Wiederholungsprüfung. */
    VALKEY_URL: z.url({ protocol: /^rediss?$/ }).default('redis://localhost:6379'),
    /** Anfragen je Minute und Client (Account bzw. IP); 0 schaltet das Limit ab. */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(300),
    /** Strengeres Limit für Login-Routen je IP. */
    RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().min(0).default(20),
    /** Token, mit dem Bots die interne API aufrufen; ohne Token ist sie abgeschaltet. */
    BOT_SERVICE_TOKEN: z
      .string()
      .min(32, 'BOT_SERVICE_TOKEN muss mindestens 32 Zeichen haben')
      .optional(),
  })
  .refine((env) => !(env.DEV_LOGIN && env.NODE_ENV === 'production'), {
    message: 'DEV_LOGIN ist in Produktion nicht erlaubt',
    path: ['DEV_LOGIN'],
  })
  .transform((env) => ({
    ...env,
    /** Alle erlaubten Adressen der Website, die Hauptadresse zuerst. */
    WEB_ORIGINS: [env.WEB_ORIGIN, ...env.WEB_EXTRA_ORIGINS.filter((o) => o !== env.WEB_ORIGIN)],
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

/**
 * Adresse der Website, über die eine Anfrage kam (Host-Header, beim Dev-Server unverändert
 * weitergereicht). Nur erlaubte Adressen zählen, sonst gilt die Hauptadresse.
 */
export function originOf(
  env: Env,
  request: { protocol: string; headers: { host?: string | undefined } },
): string {
  const host = request.headers.host;
  const origin = host ? `${request.protocol}://${host}` : null;
  return origin && env.WEB_ORIGINS.includes(origin) ? origin : env.WEB_ORIGIN;
}

/** Discord-Rücksprung-Adresse für eine Website-Adresse. */
export function discordRedirectFor(env: Env, origin: string): string {
  return origin === env.WEB_ORIGIN
    ? env.DISCORD_REDIRECT_URI
    : `${origin}/api/auth/discord/callback`;
}

export function isDiscordConfigured(env: Env): boolean {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);
}
