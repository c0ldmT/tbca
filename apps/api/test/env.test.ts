import { describe, expect, it } from 'vitest';

import { isDiscordConfigured, loadEnv } from '../src/config/env.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  WEB_ORIGIN: 'http://localhost:4200/',
  COOKIE_SECRET: 's'.repeat(32),
};

describe('loadEnv', () => {
  it('setzt sinnvolle Standardwerte', () => {
    const env = loadEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 3000,
      WEB_ORIGIN: 'http://localhost:4200',
      COOKIE_SECURE: false,
      DISCORD_REDIRECT_URI: 'http://localhost:4200/api/auth/discord/callback',
    });
    expect(isDiscordConfigured(env)).toBe(false);
  });

  it('aktiviert Secure-Cookies in Produktion', () => {
    expect(loadEnv({ ...base, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
    expect(loadEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(
      false,
    );
  });

  it('meldet fehlende oder ungültige Werte verständlich', () => {
    expect(() => loadEnv({ ...base, COOKIE_SECRET: 'kurz' })).toThrow(/COOKIE_SECRET/);
    expect(() => loadEnv({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...base, API_PORT: 'abc' })).toThrow(/API_PORT/);
  });
});
