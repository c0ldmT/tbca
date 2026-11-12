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
  it('zeigt die Tagesgegner mit Belohnungsstand', async () => {
    const res = await call(alice, 'GET', '/api/pvp/opponents');
    expect(res.json()).toEqual([
      {
        id: bobId,
        name: 'Bob',
        level: 1,
        classId: 'bruiser',
        isBot: false,
        winXp: 60,
        limit: 'none',
        rewardsLeft: 2,
      },
    ]);
    await challenge();
    const after = (await call(alice, 'GET', '/api/pvp/opponents')).json();
    expect(after[0].rewardsLeft).toBe(1);
  });

  it('erlaubt auf der Website nur Tagesgegner, die Auswahl bleibt den Tag über fest', async () => {
    // Weitere Spieler: mehr als die 5 Tagesgegner
    const add = (i: number, name: string) => {
      const id = `01933b5e-0000-7000-8000-0000000002${String(i).padStart(2, '0')}`;
      t.characters.records.push({
        id,
        accountId: `acc-${i}`,
        seasonId: t.seasons.current!.id,
        name,
        classId: 'gunner',
        level: 1,
        xp: 0,
        allocated: { str: 0, dex: 3, int: 0, con: 2 },
        loadouts: {},
      });
      return id;
    };
    for (let i = 0; i < 8; i++) add(i, `Runner${i}`);
    const first = (await call(alice, 'GET', '/api/pvp/opponents')).json();
    expect(first).toHaveLength(5);
    // Neue Spieler im Laufe des Tages ändern die Auswahl nicht
    const lateId = add(99, 'Late');
    const again = (await call(alice, 'GET', '/api/pvp/opponents')).json();
    expect(again.map((o: { id: string }) => o.id)).toEqual(first.map((o: { id: string }) => o.id));
    const outsider = await challenge('rated', lateId);
    expect(outsider.statusCode).toBe(403);
    expect(outsider.json().code).toBe('not_daily_opponent');
    expect((await challenge('rated', first[0].id)).statusCode).toBe(201);
    // Am nächsten Tag gibt es eine neue Auswahl
    t.time.tick(24 * 60 * 60 * 1000);
    const next = (await call(alice, 'GET', '/api/pvp/opponents')).json();
    expect(next).toHaveLength(5);
    expect(t.pvp.daily.size).toBe(2);
  });

  it('würfelt die Tagesgegner einmal am Tag gegen Credits neu', async () => {
    for (let i = 0; i < 12; i++)
      t.characters.records.push({
        id: `01933b5e-0000-7000-8000-0000000003${String(i).padStart(2, '0')}`,
        accountId: `acc-r${i}`,
        seasonId: t.seasons.current!.id,
        name: `Reroll${i}`,
        classId: 'netrunner',
        level: 1,
        xp: 0,
        allocated: { str: 0, dex: 0, int: 3, con: 2 },
        loadouts: {},
      });
    const first = (await call(alice, 'GET', '/api/pvp/opponents')).json();
    const status = (await call(alice, 'GET', '/api/pvp/status')).json();
    expect(status.reroll).toEqual({ cost: 23, available: true });
    // Ohne Credits geht es nicht
    expect((await call(alice, 'POST', '/api/pvp/opponents/reroll')).json().code).toBe(
      'insufficient_credits',
    );
    const me = t.characters.records.find((c) => c.name === 'Alice')!;
    t.characters.credit(me.seasonId, me.accountId, 100);
    const res = await call(alice, 'POST', '/api/pvp/opponents/reroll');
    expect(res.statusCode).toBe(200);
    const next = res.json();
    expect(next).toHaveLength(5);
    const before = new Set(first.map((o: { id: string }) => o.id));
    expect(next.filter((o: { id: string }) => before.has(o.id))).toEqual([]);
    expect((await call(alice, 'GET', '/api/characters/me')).json().credits).toBe(77);
    expect((await call(alice, 'POST', '/api/pvp/opponents/reroll')).json().code).toBe(
      'already_rerolled',
    );
    expect((await call(alice, 'GET', '/api/pvp/status')).json().reroll.available).toBe(false);
  });

  it('rechnet einen gewerteten Kampf, speichert ihn und vergibt XP', async () => {
    const res = await challenge();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.reward.rewarded).toBe(true);
    expect(body.reward.xp).toBe(body.won ? 60 : 15);
    expect(body.reward.credits).toBe(body.won ? 12 : 3);

    const me = (await call(alice, 'GET', '/api/characters/me')).json();
    expect(me.xp).toBe(body.reward.xp);
    expect(me.credits).toBe(body.reward.credits);
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

describe('Bots und Training', () => {
  function addBot(name: string, level: number) {
    const record = {
      id: `01933b5e-0000-7000-8000-0000000000${String(t.characters.records.length).padStart(2, '0')}`,
      accountId: `bot-${name}`,
      seasonId: t.seasons.current!.id,
      name,
      classId: 'netrunner' as const,
      level,
      xp: 0,
      allocated: { str: 0, dex: 0, int: 3, con: 2 },
      loadouts: {},
      isBot: true,
    };
    t.characters.records.push(record);
    return record.id;
  }

  it('zeigt Bots als Gegner und belohnt sie in Test-Seasons', async () => {
    const botId = addBot('Echo', 1);
    const list = (await call(alice, 'GET', '/api/pvp/opponents')).json();
    expect(list.find((o: { name: string }) => o.name === 'Echo')).toMatchObject({
      isBot: true,
      limit: 'none',
    });
    expect((await challenge('rated', botId)).json().reward.rewarded).toBe(true);
  });

  it('rüstet Bots für leere Plätze nach Level aus', async () => {
    const botId = addBot('Echo', 12);
    const fightId = (await challenge('friendly', botId)).json().fightId;
    const stored = t.fights.fights.find((f) => f.id === fightId)!;
    const bot = stored.input.teams[1]![0]!;
    // Level 12: Rarität 3 laut pvp.botGear, Waffe skaliert mit INT (Netrunner)
    const me = stored.input.teams[0]![0]!;
    expect(bot.stats.armor).toBeGreaterThan(me.stats.armor);
    expect(bot.attack.base).toBeGreaterThan(0);
    // fest je Bot und Level: zweiter Kampf, gleiche Werte
    const again = (await challenge('friendly', botId)).json().fightId;
    expect(t.fights.fights.find((f) => f.id === again)!.input.teams[1]![0]!.stats).toEqual(
      bot.stats,
    );
  });

  it('belohnt Bots nicht in echten Seasons', async () => {
    t.seasons.current = { ...t.seasons.current!, isTest: false };
    const botId = addBot('Echo', 1);
    const list = (await call(alice, 'GET', '/api/pvp/opponents')).json();
    expect(list.find((o: { name: string }) => o.name === 'Echo').limit).toBe('bot');
    expect((await challenge('rated', botId)).json().reward).toMatchObject({
      rewarded: false,
      limit: 'bot',
    });
  });

  it('trainiert gegen einen Computer-Gegner frei wählbarer Klasse und Stufe', async () => {
    const res = await call(alice, 'POST', '/api/pvp/training', { classId: 'medtech', level: 8 });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.reward).toMatchObject({ xp: 0, rewarded: false, limit: 'training' });

    const view = (await t.app.inject({ method: 'GET', url: `/api/fights/${body.fightId}` })).json();
    expect(view.kind).toBe('training');
    expect(view.teams[1][0]).toMatchObject({ classId: 'medtech', level: 8 });
    expect((await call(alice, 'GET', '/api/characters/me')).json().xp).toBe(0);
    expect((await call(alice, 'GET', '/api/pvp/status')).json().rewardedToday).toBe(0);
  });

  it('prüft Klasse und Stufe des Trainingsgegners', async () => {
    const bad = await call(alice, 'POST', '/api/pvp/training', { classId: 'mage', level: 8 });
    expect(bad.json().code).toBe('invalid_request');
    const tooHigh = await call(alice, 'POST', '/api/pvp/training', {
      classId: 'gunner',
      level: 101,
    });
    expect(tooHigh.json().code).toBe('invalid_level');
  });
});
