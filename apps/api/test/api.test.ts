import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ENGINE_VERSION } from '@tbca/game-core';
import { healthResponseSchema, meResponseSchema } from '@tbca/shared';

import { hashToken } from '../src/auth/session.service.js';
import {
  cookieValue,
  cookiesOf,
  createTestApp,
  login as loginAs,
  testEnv,
  WEB_ORIGIN,
  type TestApp,
} from './helpers.js';

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.app.close();
});

const inject = (opts: Parameters<TestApp['app']['inject']>[0]) => t.app.inject(opts);

const login = () => loginAs(t);

describe('GET /api/health', () => {
  it('meldet ok, wenn die Datenbank erreichbar ist', async () => {
    const res = await inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = healthResponseSchema.parse(res.json());
    expect(body).toMatchObject({
      status: 'ok',
      checks: { database: 'up' },
      engineVersion: ENGINE_VERSION,
    });
  });

  it('meldet 503, wenn die Datenbank fehlt', async () => {
    t.dbUp.value = false;
    const res = await inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'degraded', checks: { database: 'down' } });
  });

  it('setzt Sicherheits-Header', async () => {
    const res = await inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('Discord-Login', () => {
  it('leitet mit State zu Discord weiter und setzt ein signiertes State-Cookie', async () => {
    const res = await inject({ method: 'GET', url: '/api/auth/discord' });
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    const state = location.searchParams.get('state');
    expect(state).toMatch(/^[\w-]{32}$/);

    const cookie = cookiesOf(res.headers).get('tbca_oauth_state')!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookieValue(cookie)).not.toBe(state); // signiert
  });

  it('meldet an, legt eine Session an und liefert /auth/me', async () => {
    const { cookie, csrfToken } = await login();
    expect(t.sessions.byHash.has(hashToken(cookie))).toBe(true);
    expect([...t.sessions.byHash.keys()]).not.toContain(cookie); // nur der Hash wird gespeichert

    const me = await inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { tbca_session: cookie },
    });
    expect(me.statusCode).toBe(200);
    const body = meResponseSchema.parse(me.json());
    expect(body.identities).toEqual([{ provider: 'discord', displayName: 'Neo', avatarUrl: null }]);
    expect(body.csrfToken).toBe(csrfToken);
  });

  it('ordnet einen erneuten Login demselben Account zu', async () => {
    await login();
    t.discord.profile = { ...t.discord.profile, displayName: 'Neo (neu)' };
    await login();
    expect(t.accounts.accounts.size).toBe(1);
    const [acc] = t.accounts.accounts.values();
    expect(acc!.identities[0]!.displayName).toBe('Neo (neu)');
  });

  it('lehnt einen falschen State ab', async () => {
    const start = await inject({ method: 'GET', url: '/api/auth/discord' });
    const stateCookie = cookiesOf(start.headers).get('tbca_oauth_state')!;
    const res = await inject({
      method: 'GET',
      url: '/api/auth/discord/callback?code=valid-code&state=forged',
      cookies: { tbca_oauth_state: cookieValue(stateCookie) },
    });
    expect(res.headers.location).toBe(`${WEB_ORIGIN}/?login=failed`);
    expect(cookiesOf(res.headers).has('tbca_session')).toBe(false);
  });

  it('lehnt einen fehlenden oder unsignierten State ab', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/auth/discord/callback?code=valid-code&state=abc',
      cookies: { tbca_oauth_state: 'abc' },
    });
    expect(res.headers.location).toBe(`${WEB_ORIGIN}/?login=failed`);
  });

  it('meldet einen Abbruch bei Discord an die Website', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/auth/discord/callback?error=access_denied',
    });
    expect(res.headers.location).toBe(`${WEB_ORIGIN}/?login=cancelled`);
  });

  it('fängt Fehler von Discord ab', async () => {
    t.discord.fail = true;
    const start = await inject({ method: 'GET', url: '/api/auth/discord' });
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const res = await inject({
      method: 'GET',
      url: `/api/auth/discord/callback?code=valid-code&state=${state}`,
      cookies: { tbca_oauth_state: cookieValue(cookiesOf(start.headers).get('tbca_oauth_state')) },
    });
    expect(res.headers.location).toBe(`${WEB_ORIGIN}/?login=failed`);
    expect(t.accounts.accounts.size).toBe(0);
  });

  it('antwortet mit 503, wenn Discord nicht konfiguriert ist', async () => {
    await t.app.close();
    t = await createTestApp(testEnv({ DISCORD_CLIENT_ID: '', DISCORD_CLIENT_SECRET: '' }));
    const res = await inject({ method: 'GET', url: '/api/auth/discord' });
    expect(res.statusCode).toBe(503);
  });
});

describe('Sessions und CSRF', () => {
  it('verlangt eine Session für /auth/me', async () => {
    expect((await inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
    const res = await inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { tbca_session: 'erfunden' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('verlangt beim Logout das CSRF-Token', async () => {
    const { cookie } = await login();
    const res = await inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { tbca_session: cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lehnt fremde Origins ab', async () => {
    const { cookie, csrfToken } = await login();
    const res = await inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { tbca_session: cookie },
      headers: { 'x-csrf-token': csrfToken, origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('meldet mit gültigem Token ab und widerruft die Session', async () => {
    const { cookie, csrfToken } = await login();
    const res = await inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { tbca_session: cookie },
      headers: { 'x-csrf-token': csrfToken, origin: WEB_ORIGIN },
    });
    expect(res.statusCode).toBe(204);
    expect(cookiesOf(res.headers).get('tbca_session')).toMatch(/Expires=Thu, 01 Jan 1970/);

    const me = await inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { tbca_session: cookie },
    });
    expect(me.statusCode).toBe(401);
  });

  it('nutzt in Produktion __Host-Cookies mit Secure-Flag und HSTS', async () => {
    await t.app.close();
    t = await createTestApp(testEnv({ NODE_ENV: 'production' }));
    const start = await inject({ method: 'GET', url: '/api/auth/discord' });
    const cookie = cookiesOf(start.headers).get('__Host-tbca_oauth_state');
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/Path=\//);
    expect(start.headers['strict-transport-security']).toContain('max-age=');
  });
});

describe('Zugriff aus dem Heimnetz', () => {
  const LAN = 'http://192.168.178.20:4200';

  beforeEach(async () => {
    await t.app.close();
    t = await createTestApp(testEnv({ WEB_EXTRA_ORIGINS: `${LAN}, http://tbca.local:4200` }));
  });

  it('nutzt Rücksprung und Ziel der Adresse, über die der Browser kam', async () => {
    const start = await inject({
      method: 'GET',
      url: '/api/auth/discord',
      headers: { host: '192.168.178.20:4200' },
    });
    expect(t.discord.redirectUri).toBe(`${LAN}/api/auth/discord/callback`);
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const stateCookie = cookiesOf(start.headers).get('tbca_oauth_state')!;
    const callback = await inject({
      method: 'GET',
      url: `/api/auth/discord/callback?code=valid-code&state=${state}`,
      headers: { host: '192.168.178.20:4200' },
      cookies: { tbca_oauth_state: cookieValue(stateCookie) },
    });
    expect(callback.headers.location).toBe(`${LAN}/?login=success`);
    const cookie = cookieValue(cookiesOf(callback.headers).get('tbca_session'));
    const me = await inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { tbca_session: cookie },
    });
    // Schreibende Anfragen von der LAN-Adresse sind erlaubt
    const out = await inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { tbca_session: cookie },
      headers: { 'x-csrf-token': me.json().csrfToken, origin: LAN },
    });
    expect(out.statusCode).toBe(204);
  });

  it('fällt bei unbekannten Hosts auf die Hauptadresse zurück', async () => {
    await inject({ method: 'GET', url: '/api/auth/discord', headers: { host: 'evil.example' } });
    expect(t.discord.redirectUri).toBe(`${WEB_ORIGIN}/api/auth/discord/callback`);
  });
});

describe('Test-Anmeldung ohne Discord', () => {
  const devLogin = (name: string, origin = WEB_ORIGIN) =>
    inject({ method: 'POST', url: '/api/auth/dev-login', payload: { name }, headers: { origin } });

  it('ist ohne DEV_LOGIN nicht erreichbar', async () => {
    expect((await inject({ method: 'GET', url: '/api/auth/options' })).json()).toEqual({
      discord: true,
      devLogin: false,
    });
    expect((await devLogin('Tester')).statusCode).toBe(404);
  });

  it('meldet mit Namen an, derselbe Name ergibt denselben Account', async () => {
    await t.app.close();
    t = await createTestApp(testEnv({ DEV_LOGIN: 'true' }));
    expect((await inject({ method: 'GET', url: '/api/auth/options' })).json().devLogin).toBe(true);
    expect((await devLogin('Tester', 'https://evil.example')).statusCode).toBe(403);
    expect((await devLogin('<script>')).statusCode).toBe(400);
    const first = await devLogin('Tester');
    expect(first.statusCode).toBe(204);
    const cookie = cookieValue(cookiesOf(first.headers).get('tbca_session'));
    const me = await inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { tbca_session: cookie },
    });
    expect(me.json().identities[0]).toMatchObject({ provider: 'dev', displayName: 'Tester' });
    await devLogin('tester');
    expect(t.accounts.accounts.size).toBe(1);
  });
});
