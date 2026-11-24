import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

type Auth = { cookie: string; csrfToken: string };
let t: TestApp;
let me: Auth;
const DEV = '01933b5e-0000-7000-8000-00000000c001';

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
  me = await login(t, '100');
  await call(me, 'POST', '/api/characters', { name: 'Kira', classId: 'gunner' });
});

afterEach(async () => {
  await t.app.close();
});

describe('Umbenennen', () => {
  it('kostet Credits und ist erst nach 30 Tagen wieder möglich', async () => {
    const record = t.characters.records[0]!;
    expect((await call(me, 'PUT', '/api/characters/me/name', { name: 'Nova' })).json().code).toBe(
      'insufficient_credits',
    );
    t.characters.credit(record.seasonId, record.accountId, 500);
    const renamed = (await call(me, 'PUT', '/api/characters/me/name', { name: 'Nova' })).json();
    expect(renamed).toMatchObject({ name: 'Nova', credits: 300, rename: { cost: 200 } });
    expect(renamed.rename.availableAt).not.toBeNull();
    const again = (await call(me, 'PUT', '/api/characters/me/name', { name: 'Vega' })).json();
    expect(again.code).toBe('rename_cooldown');
    t.time.tick(31 * 86_400_000);
    expect((await call(me, 'PUT', '/api/characters/me/name', { name: 'Vega' })).json().name).toBe(
      'Vega',
    );
  });

  it('prüft Namensregeln und Eindeutigkeit', async () => {
    const other = await login(t, '200');
    await call(other, 'POST', '/api/characters', { name: 'Taken', classId: 'bruiser' });
    const record = t.characters.records[0]!;
    t.characters.credit(record.seasonId, record.accountId, 500);
    expect((await call(me, 'PUT', '/api/characters/me/name', { name: 'taken' })).json().code).toBe(
      'name_taken',
    );
    expect(
      (await call(me, 'PUT', '/api/characters/me/name', { name: 'admin' })).json().code,
    ).toMatch(/^invalid_name/);
  });
});

describe('Konto', () => {
  it('exportiert die eigenen Daten als Datei', async () => {
    const res = await call(me, 'GET', '/api/account/export');
    expect(res.headers['content-disposition']).toContain('tbca-daten.json');
    expect(res.json().characters[0]).toMatchObject({ name: 'Kira' });
  });

  it('speichert die Sprache', async () => {
    expect((await call(me, 'PUT', '/api/account/settings', { locale: 'en' })).statusCode).toBe(204);
    expect(t.accountData.locales.get([...t.accounts.accounts.keys()][0]!)).toBe('en');
  });

  it('löscht das Konto nur mit Bestätigung und anonymisiert Replays', async () => {
    const other = await login(t, '200');
    await call(other, 'POST', '/api/characters', { name: 'Rival', classId: 'bruiser' });
    const fight = (
      await call(other, 'POST', '/api/pvp/challenges', {
        opponentId: t.characters.records[0]!.id,
        mode: 'friendly',
      })
    ).json();
    expect(
      (await call(me, 'POST', '/api/account/delete', { confirmation: 'ja' })).json().code,
    ).toBe('confirmation_required');
    const res = await call(me, 'POST', '/api/account/delete', { confirmation: 'LÖSCHEN' });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === 'tbca_session')?.value).toBe('');
    expect((await call(me, 'GET', '/api/characters/me')).statusCode).toBe(401);
    const replay = (
      await t.app.inject({ method: 'GET', url: `/api/fights/${fight.fightId}` })
    ).json();
    expect(
      replay.teams
        .flat()
        .map((c: { name: string }) => c.name)
        .sort(),
    ).toEqual(['Gelöschter Spieler', 'Rival']);
  });
});

describe('Community-Rollen', () => {
  it('lässt Admins Rollen vergeben und Moderatoren XP begrenzt korrigieren', async () => {
    const mod = await login(t, '200');
    await call(mod, 'POST', '/api/characters', { name: 'Moddy', classId: 'medtech' });
    const [meId, modId] = [...t.accounts.accounts.keys()];
    await call(me, 'POST', `/api/communities/${DEV}/join`);
    await call(mod, 'POST', `/api/communities/${DEV}/join`);
    expect((await call(mod, 'GET', `/api/communities/${DEV}/members`)).json().code).toBe(
      'not_community_staff',
    );

    t.teams.roles.set(`${DEV}:${meId}`, 'admin');
    const members = (
      await call(me, 'PUT', `/api/communities/${DEV}/members/${modId}/role`, { role: 'moderator' })
    ).json();
    expect(members.find((m: { accountId: string }) => m.accountId === modId).role).toBe(
      'moderator',
    );
    expect(
      (
        await call(me, 'PUT', `/api/communities/${DEV}/members/${meId}/role`, { role: 'member' })
      ).json().code,
    ).toBe('last_admin');

    const corrected = (
      await call(mod, 'POST', `/api/communities/${DEV}/members/${meId}/xp`, {
        amount: 300,
        reason: 'Event-Gewinn',
      })
    ).json();
    expect(corrected.find((m: { accountId: string }) => m.accountId === meId).character.xp).toBe(
      300,
    );
    expect(
      (
        await call(mod, 'POST', `/api/communities/${DEV}/members/${meId}/xp`, {
          amount: 9000,
          reason: 'zu viel',
        })
      ).json().code,
    ).toBe('xp_limit');
    expect(
      (
        await call(mod, 'PUT', `/api/communities/${DEV}/members/${meId}/role`, { role: 'member' })
      ).json().code,
    ).toBe('not_community_staff');
    expect(t.admin.entries.map((e) => e.action)).toEqual(['community.xp', 'community.role']);
  });
});
