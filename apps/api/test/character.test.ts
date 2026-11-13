import { characterResponseSchema } from '@tbca/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

let t: TestApp;
let auth: { cookie: string; csrfToken: string };

beforeEach(async () => {
  t = await createTestApp();
  auth = await login(t);
});

afterEach(async () => {
  await t.app.close();
});

function call(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, as = auth) {
  return t.app.inject({
    method,
    url,
    cookies: { tbca_session: as.cookie },
    headers: { 'x-csrf-token': as.csrfToken, origin: WEB_ORIGIN },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

const create = (name = 'Kira', classId = 'bruiser') =>
  call('POST', '/api/characters', { name, classId });

describe('Charakter anlegen', () => {
  it('meldet 404, solange es keinen Charakter gibt', async () => {
    const res = await call('GET', '/api/characters/me');
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('no_character');
  });

  it('legt einen Charakter auf Level 1 mit Standard-Loadout an', async () => {
    const res = await create();
    expect(res.statusCode).toBe(201);
    const body = characterResponseSchema.parse(res.json());
    expect(body).toMatchObject({
      name: 'Kira',
      classId: 'bruiser',
      level: 1,
      xp: 0,
      unspentPoints: 5,
    });
    expect(body.loadout.abilities).toEqual(['bruiser.heavy_strike', 'bruiser.provoke']);
    expect(body.attributes).toEqual({ str: 5, dex: 5, int: 5, con: 5 });
    expect((await call('GET', '/api/characters/me')).json().id).toBe(body.id);
  });

  it('erlaubt nur einen Charakter pro Season', async () => {
    await create();
    const res = await create('Zweiter');
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('character_exists');
  });

  it('vergibt Namen nur einmal, unabhängig von Groß- und Kleinschreibung', async () => {
    await create('Kira');
    const other = await login(t, '999');
    const res = await call('POST', '/api/characters', { name: 'KIRA', classId: 'gunner' }, other);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('name_taken');
    const check = await call('GET', '/api/characters/name-available?name=kira', undefined, other);
    expect(check.json()).toEqual({ available: false, problem: 'taken' });
  });

  it('prüft Namensregeln', async () => {
    const res = await create('Admin');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('invalid_name_blocked');
    const check = await call('GET', '/api/characters/name-available?name=K');
    expect(check.json()).toEqual({ available: false, problem: 'too_short' });
  });

  it('verlangt Session und CSRF-Token', async () => {
    const anonymous = await t.app.inject({ method: 'GET', url: '/api/characters/me' });
    expect(anonymous.statusCode).toBe(401);
    const noCsrf = await t.app.inject({
      method: 'POST',
      url: '/api/characters',
      cookies: { tbca_session: auth.cookie },
      payload: { name: 'Kira', classId: 'bruiser' },
    });
    expect(noCsrf.statusCode).toBe(403);
  });

  it('meldet 503 ohne aktive Season', async () => {
    t.seasons.current = null;
    const res = await create();
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('no_active_season');
  });
});

describe('Attribute und Umskillen', () => {
  beforeEach(async () => {
    await create();
  });

  it('verteilt freie Punkte und aktualisiert die Kampfwerte', async () => {
    const before = (await call('GET', '/api/characters/me')).json();
    const res = await call('PUT', '/api/characters/me/attributes', {
      str: 2,
      dex: 0,
      int: 0,
      con: 3,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.unspentPoints).toBe(0);
    expect(body.attributes.con).toBe(8);
    expect(body.stats.maxHp).toBeGreaterThan(before.stats.maxHp);
  });

  it('lehnt zu viele Punkte und das Zurücknehmen ohne Umskillen ab', async () => {
    const tooMany = await call('PUT', '/api/characters/me/attributes', {
      str: 6,
      dex: 0,
      int: 0,
      con: 0,
    });
    expect(tooMany.json().code).toBe('too_many_points');
    await call('PUT', '/api/characters/me/attributes', { str: 3, dex: 0, int: 0, con: 0 });
    const decrease = await call('PUT', '/api/characters/me/attributes', {
      str: 1,
      dex: 0,
      int: 0,
      con: 0,
    });
    expect(decrease.statusCode).toBe(400);
    expect(decrease.json().code).toBe('points_decrease');
  });

  it('setzt beim Umskillen alle Punkte zurück', async () => {
    await call('PUT', '/api/characters/me/attributes', { str: 5, dex: 0, int: 0, con: 0 });
    const res = await call('POST', '/api/characters/me/respec');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      unspentPoints: 5,
      allocated: { str: 0, dex: 0, int: 0, con: 0 },
    });
  });
});

describe('Klasse und Loadout', () => {
  beforeEach(async () => {
    await create();
  });

  it('wechselt die Klasse und behält das Loadout je Klasse', async () => {
    await call('PUT', '/api/characters/me/loadout', {
      abilities: ['bruiser.heavy_strike'],
      tactics: [{ when: { type: 'always' }, use: 'bruiser.heavy_strike' }],
    });
    const gunner = await call('PUT', '/api/characters/me/class', { classId: 'gunner' });
    expect(gunner.json()).toMatchObject({
      classId: 'gunner',
      loadout: { abilities: ['gunner.double_tap', 'gunner.aimed_shot'] },
    });
    const back = await call('PUT', '/api/characters/me/class', { classId: 'bruiser' });
    expect(back.json().loadout.abilities).toEqual(['bruiser.heavy_strike']);
  });

  it('prüft das Loadout gegen Klasse und Level', async () => {
    const foreign = await call('PUT', '/api/characters/me/loadout', {
      abilities: ['gunner.double_tap'],
      tactics: [],
    });
    expect(foreign.json().code).toBe('unknown_ability');
    const locked = await call('PUT', '/api/characters/me/loadout', {
      abilities: ['bruiser.shockwave'],
      tactics: [],
    });
    expect(locked.json().code).toBe('ability_locked');
    const badRule = await call('PUT', '/api/characters/me/loadout', {
      abilities: ['bruiser.provoke'],
      tactics: [{ when: { type: 'self_hp_below', permille: 2000 }, use: 'bruiser.provoke' }],
    });
    expect(badRule.json().code).toBe('invalid_request');
  });

  it('liefert die Spielinhalte der Season', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/game/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ configVersion: 2, game: { maxLevel: 100 } });
    expect(res.json().game.abilities.length).toBeGreaterThanOrEqual(16);
  });
});
