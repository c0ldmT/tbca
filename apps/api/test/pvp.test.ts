import { ENGINE_VERSION, simulateBattle, type BattleInput } from '@tbca/game-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

let t: TestApp;
type Auth = { cookie: string; csrfToken: string };
let alice: Auth;
let bob: Auth;
let bobId: string;

function call(as: Auth, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
  return t.app.inject({
    method,
    url,
    cookies: { tbca_session: as.cookie },
    headers: { 'x-csrf-token': as.csrfToken, origin: WEB_ORIGIN },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

const challenge = (mode: 'rated' | 'friendly' = 'rated', opponentId = bobId) =>
  call(alice, 'POST', '/api/pvp/challenges', { opponentId, mode });

beforeEach(async () => {
  t = await createTestApp();
  alice = await login(t, '1001');
  bob = await login(t, '1002');
  await call(alice, 'POST', '/api/characters', { name: 'Alice', classId: 'gunner' });
  bobId = (await call(bob, 'POST', '/api/characters', { name: 'Bob', classId: 'bruiser' })).json()
    .id;
});

afterEach(async () => {
  await t.app.close();
});

describe('PvP-Herausforderungen', () => {
  it('findet Gegner der Season ohne den eigenen Charakter', async () => {
    const res = await call(alice, 'GET', '/api/pvp/opponents?q=bo');
    expect(res.json()).toEqual([
      { id: bobId, name: 'Bob', level: 1, classId: 'bruiser', winXp: 60, limit: 'none' },
    ]);
  });

  it('rechnet einen gewerteten Kampf, speichert ihn und vergibt XP', async () => {
    const res = await challenge();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.reward.rewarded).toBe(true);
    expect(body.reward.xp).toBe(body.won ? 60 : 15);

    const me = (await call(alice, 'GET', '/api/characters/me')).json();
    expect(me.xp).toBe(body.reward.xp);
    expect((await call(alice, 'GET', '/api/pvp/status')).json()).toMatchObject({
      day: '2026-11-12',
      rewardedToday: 1,
      dailyLimit: 10,
    });
  });

  it('steigt mit genug XP im Level auf', async () => {
    let level = 1;
    for (let i = 0; i < 4 && level === 1; i++) {
      const body = (await challenge('rated', bobId)).json();
      level = body.level.after;
      if (i === 1) break; // gegen denselben Gegner gibt es danach nichts mehr
    }
    const me = (await call(alice, 'GET', '/api/characters/me')).json();
    expect(me.level).toBe(me.xp >= 128 ? 2 : 1);
    if (me.level === 2) expect(me.unspentPoints).toBe(10);
  });

  it('belohnt denselben Gegner nur zweimal am Tag (100 %, 50 %)', async () => {
    const rewards = [];
    for (let i = 0; i < 3; i++) rewards.push((await challenge()).json().reward);
    expect(rewards.map((r) => r.rewarded)).toEqual([true, true, false]);
    expect(rewards[2].limit).toBe('same_opponent');
    expect((await call(alice, 'GET', '/api/pvp/opponents')).json()[0].winXp).toBe(0);
  });

  it('setzt die Zähler am nächsten Spieltag zurück', async () => {
    await challenge();
    await challenge();
    t.time.tick(24 * 60 * 60 * 1000);
    expect((await challenge()).json().reward.rewarded).toBe(true);
  });

  it('gibt bei Freundschaftskämpfen nichts', async () => {
    const body = (await challenge('friendly')).json();
    expect(body.reward).toMatchObject({ xp: 0, rewarded: false, limit: 'friendly' });
    expect((await call(alice, 'GET', '/api/pvp/status')).json().rewardedToday).toBe(0);
  });

  it('lehnt unbekannte Gegner und sich selbst ab', async () => {
    const unknown = await challenge('rated', '01933b5e-0000-7000-8000-00000000abcd');
    expect(unknown.json().code).toBe('opponent_not_found');
    const meId = (await call(alice, 'GET', '/api/characters/me')).json().id;
    expect((await challenge('rated', meId)).json().code).toBe('self_challenge');
  });
});

describe('Replays', () => {
  it('liefert einen Kampf öffentlich und exakt nachrechenbar', async () => {
    const { fightId } = (await challenge()).json();
    const res = await t.app.inject({ method: 'GET', url: `/api/fights/${fightId}` });
    expect(res.statusCode).toBe(200);
    const view = res.json();
    expect(view.teams.map((team: { name: string }[]) => team[0]!.name)).toEqual(['Alice', 'Bob']);

    const stored = t.fights.fights[0]!;
    const replay = simulateBattle({
      ...(stored.input as Omit<BattleInput, 'engineVersion' | 'configVersion' | 'seed'>),
      engineVersion: ENGINE_VERSION,
      configVersion: stored.configVersion,
      seed: stored.seed,
    });
    expect(replay.logHash).toBe(view.logHash);
    expect(replay.events).toEqual(view.events);
  });

  it('listet die eigenen Kämpfe', async () => {
    await challenge();
    await challenge('friendly');
    const list = (await call(alice, 'GET', '/api/fights')).json();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ kind: 'pvp_friendly', opponents: ['Bob'] });
  });

  it('meldet 404 für unbekannte Kämpfe', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/fights/01933b5e-0000-7000-8000-00000000abcd',
    });
    expect(res.statusCode).toBe(404);
  });
});
