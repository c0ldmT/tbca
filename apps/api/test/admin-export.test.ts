import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

type Auth = { cookie: string; csrfToken: string };
let t: TestApp;
let adminAuth: Auth;
let alice: Auth;

function call(as: Auth, method: 'GET' | 'POST', url: string, payload?: unknown) {
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
  alice = await login(t, '200');
  const bob = await login(t, '300');
  t.accounts.roles.set([...t.accounts.accounts.keys()][0]!, 'superadmin');
  t.discord.profile = { ...t.discord.profile, displayName: 'Alice Realname' };
  await call(alice, 'POST', '/api/characters', { name: 'Alice', classId: 'gunner' });
  const bobId = (
    await call(bob, 'POST', '/api/characters', { name: 'Bobby', classId: 'bruiser' })
  ).json().id;
  await call(alice, 'POST', '/api/pvp/challenges', { opponentId: bobId, mode: 'rated' });
});

afterEach(async () => {
  await t.app.close();
});

describe('Balancing-Report', () => {
  it('simuliert mehrere Stufen und legt die Konfiguration bei', async () => {
    const res = await call(adminAuth, 'POST', '/api/admin/simulations/report', {
      fights: 10,
      runs: 4,
    });
    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report).toMatchObject({ format: 'tbca-sim-report/v1', version: 2, fights: 10 });
    expect(report.points.map((p: { level: number }) => p.level)).toEqual([3, 10, 20, 30, 50, 80]);
    expect(report.points[0].matchups.cells).toHaveLength(16);
    expect(report.points[0].dungeon.runs).toBe(16);
    expect(report.config.game.items.templates.length).toBeGreaterThan(0);
    expect((await call(alice, 'POST', '/api/admin/simulations/report', {})).statusCode).toBe(403);
  });
});

describe('Datenexport', () => {
  it('exportiert Builds, Kämpfe und Konfiguration ohne Namen oder IDs', async () => {
    const res = await call(adminAuth, 'GET', '/api/admin/export?days=7');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/tbca-data-2026-11-12\.json/);
    const doc = res.json();
    expect(doc).toMatchObject({ format: 'tbca-data/v1', window: { days: 7 } });
    expect(doc.characters).toHaveLength(2);
    expect(doc.fights).toHaveLength(1);
    const fighters = doc.fights[0].teams.flat();
    expect(fighters.map((f: { classId: string }) => f.classId).sort()).toEqual([
      'bruiser',
      'gunner',
    ]);
    expect(fighters[0].abilities.length).toBeGreaterThan(0);
    // Kürzel verbinden Kampf und Charakter, verraten aber nichts
    const refs = new Set(doc.characters.map((c: { ref: string }) => c.ref));
    for (const f of fighters) expect(refs.has(f.ref)).toBe(true);
    const text = res.body;
    for (const secret of ['Alice', 'Bobby', 'Realname', ...t.characters.records.map((c) => c.id)])
      expect(text).not.toContain(secret);
    for (const id of t.accounts.accounts.keys()) expect(text).not.toContain(id);
    expect(t.admin.entries[0]).toMatchObject({ action: 'data.export' });
  });

  it('erzeugt in jedem Export neue Kürzel', async () => {
    const a = (await call(adminAuth, 'GET', '/api/admin/export')).json();
    const b = (await call(adminAuth, 'GET', '/api/admin/export')).json();
    expect(a.characters[0].ref).not.toBe(b.characters[0].ref);
  });
});
