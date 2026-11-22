import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

type Auth = { cookie: string; csrfToken: string };
let t: TestApp;
let adminAuth: Auth;
let player: Auth;
let playerId: string;

function call(as: Auth, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
  return t.app.inject({
    method,
    url,
    cookies: { tbca_session: as.cookie },
    headers: { 'x-csrf-token': as.csrfToken, origin: WEB_ORIGIN },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

beforeEach(async () => {
  t = await createTestApp();
  adminAuth = await login(t, '100');
  player = await login(t, '200');
  const [adminId, pid] = [...t.accounts.accounts.keys()];
  t.accounts.roles.set(adminId!, 'superadmin');
  playerId = pid!;
  t.discord.profile = { ...t.discord.profile, displayName: 'Neo' };
  await call(player, 'POST', '/api/characters', { name: 'Trinity', classId: 'gunner' });
});

afterEach(async () => {
  await t.app.close();
});

describe('Admin-Bereich', () => {
  it('ist nur für Superadmins', async () => {
    expect((await call(player, 'GET', '/api/admin/time')).json().code).toBe('not_admin');
    expect((await call(adminAuth, 'GET', '/api/admin/time')).statusCode).toBe(200);
  });

  it('stellt in Test-Seasons den Zeitfaktor ein und spult vor', async () => {
    const before = (await call(adminAuth, 'GET', '/api/admin/time')).json();
    const res = (
      await call(adminAuth, 'PUT', '/api/admin/time', { factor: 24, advanceMs: 86_400_000 })
    ).json();
    expect(res.factor).toBe(24);
    expect(Date.parse(res.gameNow) - Date.parse(before.gameNow)).toBeGreaterThanOrEqual(86_400_000);
    expect(t.seasons.current!.clock.factor).toBe(24);
    expect(t.admin.entries[0]).toMatchObject({ action: 'time.advance', targetType: 'season' });

    t.seasons.current = { ...t.seasons.current!, isTest: false };
    expect((await call(adminAuth, 'PUT', '/api/admin/time', { factor: 2 })).json().code).toBe(
      'test_season_only',
    );
  });

  it('sperrt Spieler, beendet ihre Sessions und hebt die Sperre wieder auf', async () => {
    const found = (await call(adminAuth, 'GET', '/api/admin/accounts?q=trin')).json();
    expect(found[0]).toMatchObject({ accountId: playerId, character: { name: 'Trinity' } });
    expect(
      (
        await call(adminAuth, 'POST', `/api/admin/accounts/${playerId}/ban`, {
          reason: 'Bot-Farming',
        })
      ).statusCode,
    ).toBe(204);
    expect((await call(player, 'GET', '/api/characters/me')).statusCode).toBe(401); // Session beendet
    // Neuer Login ist möglich, jede Anfrage wird aber abgelehnt.
    const again = await login(t, '200');
    const me = () =>
      t.app.inject({
        method: 'GET',
        url: '/api/characters/me',
        cookies: { tbca_session: again.cookie },
      });
    expect((await me()).json().code).toBe('account_banned');
    await call(adminAuth, 'POST', `/api/admin/accounts/${playerId}/ban`, { reason: null });
    expect((await me()).statusCode).toBe(200);
    expect(t.admin.entries.map((e) => e.action).slice(0, 2)).toEqual([
      'account.unban',
      'account.ban',
    ]);
  });

  it('korrigiert XP samt Level und Credits mit Begründung', async () => {
    const xp = (
      await call(adminAuth, 'POST', `/api/admin/accounts/${playerId}/xp`, {
        amount: 500,
        reason: 'Ausgleich Serverfehler',
      })
    ).json();
    expect(xp).toEqual({ xp: 500, level: 4 });
    const down = (
      await call(adminAuth, 'POST', `/api/admin/accounts/${playerId}/xp`, {
        amount: -10_000,
        reason: 'Missbrauch',
      })
    ).json();
    expect(down).toEqual({ xp: 0, level: 1 });
    await call(adminAuth, 'POST', `/api/admin/accounts/${playerId}/credits`, {
      amount: 250,
      reason: 'Turniergewinn',
    });
    expect((await call(player, 'GET', '/api/characters/me')).json().credits).toBe(250);
    expect(
      (
        await call(adminAuth, 'POST', `/api/admin/accounts/${playerId}/credits`, {
          amount: -999,
          reason: 'Abzug',
        })
      ).json().code,
    ).toBe('insufficient_credits');
    const audit = (await call(adminAuth, 'GET', '/api/admin/audit')).json();
    expect(audit.map((e: { action: string }) => e.action)).toEqual([
      'account.credits',
      'character.xp',
      'character.xp',
    ]);
    expect(audit[1].data).toMatchObject({
      amount: -10_000,
      reason: 'Missbrauch',
      levelBefore: 4,
      levelAfter: 1,
    });
  });
});

describe('Worker-Jobs', () => {
  it('beendet Dungeon-Runs ohne Entscheidung nach 10 Minuten', async () => {
    const me = t.characters.records[0]!;
    t.characters.credit(me.seasonId, me.accountId, 100);
    const view = (
      await call(player, 'POST', '/api/dungeon/start', { injectors: 0, backupChip: false })
    ).json();
    const job = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/internal/jobs/expire-dungeon-runs',
        headers: { authorization: `Bearer ${'b'.repeat(40)}` },
      });
    expect((await job()).json()).toEqual({ expired: 0 });
    t.time.tick(11 * 60 * 1000);
    expect((await job()).json()).toEqual({ expired: view.run.status === 'active' ? 1 : 0 });
  });
});
