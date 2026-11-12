import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

type Auth = { cookie: string; csrfToken: string };
let t: TestApp;
let adminAuth: Auth;
let alice: Auth;
let bob: Auth;
let aliceId: string;
let bobCharacter: string;

function call(as: Auth, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
  return t.app.inject({
    method,
    url,
    cookies: { tbca_session: as.cookie },
    headers: { 'x-csrf-token': as.csrfToken, origin: WEB_ORIGIN },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

/** Drei Dungeon-Runs starten und sofort verlassen – danach ist das Tageslimit erreicht. */
async function useAllRuns(as: Auth) {
  for (let i = 0; i < 3; i++) {
    expect(
      (await call(as, 'POST', '/api/dungeon/start', { injectors: 0, backupChip: false }))
        .statusCode,
    ).toBe(200);
    if ((await call(as, 'GET', '/api/dungeon')).json().run?.status === 'active')
      await call(as, 'POST', '/api/dungeon/leave');
  }
}

beforeEach(async () => {
  t = await createTestApp();
  adminAuth = await login(t, '100');
  alice = await login(t, '200');
  bob = await login(t, '300');
  const [adminId, aid] = [...t.accounts.accounts.keys()];
  t.accounts.roles.set(adminId!, 'superadmin');
  aliceId = aid!;
  await call(alice, 'POST', '/api/characters', { name: 'Alice', classId: 'gunner' });
  bobCharacter = (
    await call(bob, 'POST', '/api/characters', { name: 'Bobby', classId: 'bruiser' })
  ).json().id;
  for (const c of t.characters.records) t.characters.credit(c.seasonId, c.accountId, 1000);
});

afterEach(async () => {
  await t.app.close();
});

describe('Season-Steuerung', () => {
  it('ist nur für Superadmins und zeigt die Kennzahlen des Tages', async () => {
    expect((await call(alice, 'GET', '/api/admin/season')).json().code).toBe('not_admin');
    await call(alice, 'POST', '/api/pvp/challenges', { opponentId: bobCharacter, mode: 'rated' });
    const view = (await call(adminAuth, 'GET', '/api/admin/season')).json();
    expect(view.season).toMatchObject({ slug: 'test-season', isTest: true });
    expect(view.day).toBe('2026-11-12');
    expect(view.stats).toMatchObject({ characters: 2, playedToday: 2, rewardedFightsToday: 1 });
    expect(view.limits).toEqual({ dungeonRunsPerDay: 3, rewardedFightsPerDay: 10 });
  });

  it('setzt die Dungeon-Runs eines Spielers zurück, andere bleiben am Limit', async () => {
    await useAllRuns(alice);
    await useAllRuns(bob);
    const start = (as: Auth) =>
      call(as, 'POST', '/api/dungeon/start', { injectors: 0, backupChip: false });
    expect((await start(alice)).json().code).toBe('no_runs_left');

    const res = await call(adminAuth, 'POST', '/api/admin/season/daily-reset', {
      kinds: ['dungeon'],
      accountId: aliceId,
      reason: 'Test des Runs',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().resetsToday[0]).toMatchObject({ kind: 'dungeon', characterName: 'Alice' });
    expect((await call(alice, 'GET', '/api/dungeon')).json().runsToday).toBe(0);
    expect((await start(alice)).statusCode).toBe(200);
    expect((await start(bob)).json().code).toBe('no_runs_left');
    expect(t.admin.entries[0]).toMatchObject({
      action: 'season.daily_reset',
      targetType: 'character',
      data: { kinds: ['dungeon'], reason: 'Test des Runs' },
    });
  });

  it('setzt belohnte Kämpfe für alle zurück', async () => {
    await call(alice, 'POST', '/api/pvp/challenges', { opponentId: bobCharacter, mode: 'rated' });
    const status = () => call(alice, 'GET', '/api/pvp/status').then((r) => r.json());
    expect((await status()).rewardedToday).toBe(1);
    await call(adminAuth, 'POST', '/api/admin/season/daily-reset', {
      kinds: ['fights', 'passive'],
      reason: 'Neustart nach Bugfix',
    });
    expect((await status()).rewardedToday).toBe(0);
    // Kämpfe nach der Rücksetzung zählen wieder
    await call(alice, 'POST', '/api/pvp/challenges', { opponentId: bobCharacter, mode: 'rated' });
    expect((await status()).rewardedToday).toBe(1);
  });

  it('löst Jobs aus und beendet laufende Runs', async () => {
    await call(alice, 'POST', '/api/dungeon/start', { injectors: 0, backupChip: false });
    const active = (await call(alice, 'GET', '/api/dungeon')).json().run?.status === 'active';
    const res = (await call(adminAuth, 'POST', '/api/admin/season/jobs/end-dungeon-runs')).json();
    expect(res).toMatchObject({ job: 'end-dungeon-runs', result: { ended: active ? 1 : 0 } });
    expect((await call(alice, 'GET', '/api/dungeon')).json().run?.status).not.toBe('active');
    const stats = (await call(adminAuth, 'POST', '/api/admin/season/jobs/season-stats')).json();
    expect(stats.result).toEqual({ medianLevel: 1 });
    expect((await call(adminAuth, 'POST', '/api/admin/season/jobs/unknown')).statusCode).toBe(400);
  });

  it('verschiebt das Season-Ende, aber nicht vor den Start', async () => {
    const view = (
      await call(adminAuth, 'PUT', '/api/admin/season/end', { endsAt: '2027-02-28T23:00:00Z' })
    ).json();
    expect(view.season.endsAt).toBe('2027-02-28T23:00:00.000Z');
    const bad = await call(adminAuth, 'PUT', '/api/admin/season/end', {
      endsAt: '2026-10-01T00:00:00Z',
    });
    expect(bad.json().code).toBe('season_end_before_start');
  });

  it('setzt die Season nur mit passendem Slug zurück', async () => {
    await call(alice, 'POST', '/api/pvp/challenges', { opponentId: bobCharacter, mode: 'rated' });
    const reset = (confirm: string, mode = 'progress') =>
      call(adminAuth, 'POST', '/api/admin/season/reset', { mode, confirm, reason: 'Neustart' });
    expect((await reset('falsch')).json().code).toBe('confirm_mismatch');
    expect(t.fights.fights).toHaveLength(1);

    const done = (await reset('test-season')).json();
    expect(done).toMatchObject({ mode: 'progress', characters: 2, fights: 1 });
    expect(t.fights.fights).toHaveLength(0);
    const me = (await call(alice, 'GET', '/api/characters/me')).json();
    expect(me).toMatchObject({ name: 'Alice', level: 1, xp: 0, credits: 0 });
    expect(t.admin.entries[0]).toMatchObject({ action: 'season.reset.progress' });

    expect((await reset('test-season', 'wipe')).json()).toMatchObject({ characters: 2 });
    expect((await call(alice, 'GET', '/api/characters/me')).statusCode).toBe(404);
  });
});
