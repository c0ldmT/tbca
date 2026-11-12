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

  it('liest weitere Website-Adressen und sperrt DEV_LOGIN in Produktion', () => {
    const env = loadEnv({
      ...base,
      WEB_EXTRA_ORIGINS: 'http://192.168.178.20:4200/, http://localhost:4200',
    });
    expect(env.WEB_ORIGINS).toEqual(['http://localhost:4200', 'http://192.168.178.20:4200']);
    expect(() => loadEnv({ ...base, WEB_EXTRA_ORIGINS: 'ftp://x' })).toThrow(/Keine gültige/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', DEV_LOGIN: 'true' })).toThrow(
      /DEV_LOGIN/,
    );
  });
});
