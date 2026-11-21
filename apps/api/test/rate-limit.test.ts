import { afterEach, describe, expect, it } from 'vitest';

import { createTestApp, login, testEnv, type TestApp } from './helpers.js';

let t: TestApp | undefined;

afterEach(async () => {
  await t?.app.close();
});

describe('Rate-Limits', () => {
  it('begrenzt Anfragen je Client und meldet 429 mit Wartezeit', async () => {
    t = await createTestApp(testEnv({ RATE_LIMIT_PER_MINUTE: '3' }));
    const auth = await login(t); // Login-Ablauf zählt nicht gegen das Session-Limit
    const call = () =>
      t!.app.inject({ method: 'GET', url: '/api/auth/me', cookies: { tbca_session: auth.cookie } });
    for (let i = 0; i < 2; i++) expect((await call()).statusCode).toBe(200);
    const limited = await call();
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ code: 'rate_limited' });
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('nimmt Healthchecks aus und begrenzt den Login strenger', async () => {
    t = await createTestApp(
      testEnv({ RATE_LIMIT_PER_MINUTE: '50', RATE_LIMIT_AUTH_PER_MINUTE: '2' }),
    );
    for (let i = 0; i < 60; i++)
      expect((await t.app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    const start = () => t!.app.inject({ method: 'GET', url: '/api/auth/discord' });
    expect((await start()).statusCode).toBe(302);
    expect((await start()).statusCode).toBe(302);
    expect((await start()).statusCode).toBe(429);
  });
});
