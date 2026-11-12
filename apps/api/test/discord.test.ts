import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

let t: TestApp;
const DEV = '01933b5e-0000-7000-8000-00000000c001';
const GUILD = '111111111111111111';
const CHANNEL = '222222222222222222';
const USER = '333333333333333333';
const OTHER = '444444444444444444';
let eventId = 900000000000000000n;

function bot(method: 'GET' | 'POST', url: string, payload?: unknown, token = 'b'.repeat(40)) {
  return t.app.inject({
    method,
    url: `/api/internal/discord/${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

/** Worker-Job über den internen Endpunkt auslösen. */
const job = (path: string) =>
  t.app.inject({
    method: 'POST',
    url: `/api/internal/jobs/${path}`,
    headers: { authorization: `Bearer ${'b'.repeat(40)}` },
  });

const profile = async () => (await bot('GET', `profile?userId=${USER}`)).json() as { xp: number };

const message = (overrides: Record<string, unknown> = {}) =>
  bot('POST', 'activity', {
    eventId: String(eventId++),
    guildId: GUILD,
    channelId: CHANNEL,
    userId: USER,
    displayName: 'Neo',
    length: 24,
    hash: 'a'.repeat(16),
    ...overrides,
  });

async function setup() {
  await bot('POST', 'setup', {
    guildId: GUILD,
    guildName: 'Night City',
    userId: '777777777777777777',
    displayName: 'Boss',
  });
  await bot('POST', 'channel-xp', { guildId: GUILD, channelId: CHANNEL, enabled: true });
  await bot('POST', 'register', {
    guildId: GUILD,
    userId: USER,
    displayName: 'Neo',
    name: 'Neo',
    classId: 'gunner',
  });
}

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.app.close();
});

describe('Interne Discord-API', () => {
  it('macht den einrichtenden Server-Admin zum Community-Admin', async () => {
    await setup();
    const bossId = [...t.accounts.accounts.keys()][0]!;
    const communityId = t.guilds.guilds.get(GUILD)!.communityId;
    expect(t.guilds.roles.get(`${communityId}:${bossId}`)).toBe('admin');
  });

  it('verlangt das Service-Token', async () => {
    expect((await bot('GET', `profile?userId=${USER}`, undefined, 'x'.repeat(40))).statusCode).toBe(
      401,
    );
  });

  it('richtet eine Community ein und registriert per Slash-Command einen Schatten-Account', async () => {
    const unknown = await bot('POST', 'register', {
      guildId: GUILD,
      userId: USER,
      displayName: 'Neo',
      name: 'Neo',
      classId: 'gunner',
    });
    expect(unknown.json().code).toBe('guild_not_set_up');
    await setup();
    const profile = (await bot('GET', `profile?userId=${USER}`)).json();
    expect(profile).toMatchObject({
      name: 'Neo',
      classId: 'gunner',
      level: 1,
      url: `${WEB_ORIGIN}/character`,
    });
    const accountId = [...t.accounts.accounts.keys()][1]!; // [0] ist der einrichtende Admin
    expect(t.guilds.members.get(accountId)).toEqual([expect.objectContaining({ isHome: true })]);

    // Späterer Web-Login mit derselben Discord-ID übernimmt den Account samt Charakter.
    const web = await login(t, USER);
    const me = await t.app.inject({
      method: 'GET',
      url: '/api/characters/me',
      cookies: { tbca_session: web.cookie },
    });
    expect(me.json().name).toBe('Neo');
  });

  it('merkt Aktivitäts-XP mit Cooldown, Wiederholungs- und Kanalprüfung vor', async () => {
    await setup();
    const first = (await message()).json();
    expect(first.reason).toBe('queued');
    expect(first.queued).toBeGreaterThanOrEqual(15);
    expect((await message({ hash: 'b'.repeat(16) })).json().reason).toBe('cooldown');
    t.time.tick(61_000);
    expect((await message({ hash: 'b'.repeat(16) })).json().reason).toBe('repeat'); // gleiche Nachricht direkt hintereinander
    expect((await message({ hash: 'c'.repeat(16) })).json().reason).toBe('queued');
    t.time.tick(61_000);
    expect((await message({ length: 3, hash: 'd'.repeat(16) })).json().reason).toBe('too_short');
    expect((await message({ channelId: '555555555555555555' })).json().reason).toBe(
      'channel_disabled',
    );
    expect((await message({ userId: OTHER })).json().reason).toBe('not_registered');
  });

  it('verarbeitet dieselbe Nachricht nur einmal', async () => {
    await setup();
    const id = String(eventId++);
    expect((await message({ eventId: id })).json().reason).toBe('queued');
    t.time.tick(61_000);
    expect((await message({ eventId: id, hash: 'e'.repeat(16) })).json().reason).toBe('duplicate');
  });

  it('bucht vorgemerkte XP gebündelt und erst dann', async () => {
    await setup();
    const xpBefore = (await profile()).xp;
    let queued = 0;
    for (let i = 0; i < 3; i++) {
      t.time.tick(61_000);
      queued += (await message({ hash: `a${i}`.padStart(16, '0') })).json().queued;
    }
    expect((await profile()).xp).toBe(xpBefore);
    const flush = (await job('flush-passive-xp')).json();
    expect(flush).toMatchObject({ entries: 3, bundles: 1, awarded: queued });
    expect((await profile()).xp).toBe(xpBefore + queued);
    // Nichts doppelt
    expect((await job('flush-passive-xp')).json()).toMatchObject({ entries: 0 });
  });

  it('deckelt passive XP pro Tag', async () => {
    await setup();
    let total = 0;
    for (let i = 0; i < 60; i++) {
      t.time.tick(61_000);
      const res = (await message({ hash: i.toString(16).padStart(16, '0') })).json();
      if (res.reason === 'daily_cap') break;
      // Gebündelt buchen, damit das gebuchte Limit greift
      total += (await job('flush-passive-xp')).json().awarded;
    }
    // Level 1–2: voll bis 80–120, halb bis 240–360 – weit unter 60 × 25 = 1 500.
    expect(total).toBeLessThanOrEqual(240);
    t.time.tick(61_000);
    expect((await message({ hash: 'f'.repeat(16) })).json().reason).toBe('daily_cap');
  });

  it('spielt den Dungeon über den Bot mit versiegeltem Loot', async () => {
    await setup();
    const me = t.characters.records.find((c) => c.name === 'Neo')!;
    t.characters.credit(me.seasonId, me.accountId, 500);
    const dungeon = (action: string) =>
      bot('POST', 'dungeon', { userId: USER, displayName: 'Neo', action });
    const none = (await dungeon('status')).json();
    expect(none).toMatchObject({ status: 'none', runsLeft: 3 });
    const started = (await dungeon('start')).json();
    expect(started.lastFloor).toMatchObject({ floor: 1 });
    if (started.status !== 'active') return; // Etage 1 verloren – selten, aber möglich
    expect(started.finds).toBeGreaterThan(0);
    expect(started.items).toEqual([]);
    const left = (await dungeon('leave')).json();
    expect(left.status).toBe('left');
    expect(left.items).toHaveLength(started.finds);
    // Namen je Sprache aus der Konfiguration, nicht die ID
    for (const item of left.items) {
      expect(item.names.de.length).toBeGreaterThan(0);
      expect(item.names.de).not.toContain('_');
    }
    expect(left.url).toBe(`${WEB_ORIGIN}/fight/dungeon`);
  });

  it('zeigt Teams und verlangt für Team-Kämpfe ein eigenes Team', async () => {
    await setup();
    expect((await bot('GET', `teams?userId=${USER}`)).json()).toMatchObject({ teams: [] });
    const res = await bot('POST', 'team-challenge', {
      userId: USER,
      displayName: 'Neo',
      opponentTag: 'CHW',
      size: 2,
      mode: 'friendly',
    });
    expect(res.json().code).toBe('no_team');
  });

  it('lässt Team-Herausforderungen vom gegnerischen Kapitän annehmen und belohnt beide Teams', async () => {
    await setup();
    const users = { other: OTHER, mate: '555555555555555555', rival: '666666666666666666' };
    const names = { other: 'Trinity', mate: 'Morpheus', rival: 'Smith' };
    for (const key of ['other', 'mate', 'rival'] as const)
      await bot('POST', 'register', {
        guildId: GUILD,
        userId: users[key],
        displayName: names[key],
        name: names[key],
        classId: 'bruiser',
      });
    const acc = async (id: string) => (await t.accounts.findAccountId('discord', id))!;
    const team = (tag: string, members: string[]) => ({
      id: randomUUID(),
      communityId: DEV,
      communityName: 'Dev Community',
      name: `Team ${tag}`,
      tag,
      logo: 'wolf',
      captainAccountId: members[0]!,
      joinCode: tag.repeat(4),
      focus: 'threat' as const,
      lineup2: [],
      lineup3: [],
      members,
    });
    t.teams.teams.push(team('NEO', [await acc(USER), await acc(users.mate)]));
    t.teams.teams.push(team('AGT', [await acc(OTHER), await acc(users.rival)]));

    const request = (
      await bot('POST', 'team-challenge', {
        userId: USER,
        displayName: 'Neo',
        opponentTag: 'agt',
        size: 2,
        mode: 'rated',
      })
    ).json();
    expect(request).toMatchObject({
      ownTag: 'NEO',
      opponentTag: 'AGT',
      size: 2,
      mode: 'rated',
      captainUserId: OTHER,
    });
    expect(t.fights.fights).toHaveLength(0);

    const answer = (userId: string, accept: boolean, requestId = request.id) =>
      bot('POST', 'team-challenge-answer', { userId, displayName: 'x', requestId, accept });
    // Nur der Kapitän des Gegner-Teams entscheidet
    expect((await answer(users.rival, true)).json().code).toBe('not_captain');
    expect((await answer(USER, true)).json().code).toBe('not_captain');
    const accepted = (await answer(OTHER, true)).json();
    expect(accepted).toMatchObject({ status: 'accepted', ownTag: 'NEO', opponentTag: 'AGT' });
    expect(accepted.fight.replayUrl).toMatch(new RegExp(`^${WEB_ORIGIN}/replay/`));
    expect(accepted.fight.rewards).toHaveLength(2);
    expect(accepted.fight.opponentRewards).toHaveLength(2);
    expect(accepted.fight.opponentRewards[0].xp).toBeGreaterThan(0);
    const fight = t.fights.fights[0]!;
    expect(fight.kind).toBe('team_rated');
    expect(fight.participants.filter((p) => p.team === 1).every((p) => p.rewarded)).toBe(true);
    expect((await answer(OTHER, true)).json().code).toBe('challenge_closed');

    const again = (
      await bot('POST', 'team-challenge', {
        userId: USER,
        displayName: 'Neo',
        opponentTag: 'AGT',
        size: 2,
        mode: 'friendly',
      })
    ).json();
    expect(again.id).not.toBe(request.id);
    expect((await answer(OTHER, false, again.id)).json()).toMatchObject({
      status: 'declined',
      fight: null,
    });
    expect(t.fights.fights).toHaveLength(1);
  });

  it('fordert über eine Anfrage heraus, die der Gegner annehmen muss', async () => {
    await setup();
    await bot('POST', 'register', {
      guildId: GUILD,
      userId: OTHER,
      displayName: 'Trin',
      name: 'Trinity',
      classId: 'bruiser',
    });
    const ask = () =>
      bot('POST', 'challenge', {
        userId: USER,
        displayName: 'Neo',
        opponentUserId: OTHER,
        mode: 'rated',
      });
    const request = (await ask()).json();
    expect(request).toMatchObject({
      challenger: 'Neo',
      opponent: 'Trinity',
      opponentUserId: OTHER,
      mode: 'rated',
    });
    // Noch kein Kampf; eine zweite Anfrage liefert dieselbe offene
    expect(t.fights.fights).toHaveLength(0);
    expect((await ask()).json().id).toBe(request.id);

    const answer = (userId: string, accept: boolean) =>
      bot('POST', 'challenge-answer', {
        userId,
        displayName: 'x',
        requestId: request.id,
        accept,
      });
    // Nur der Gegner darf antworten
    expect((await answer(USER, true)).json().code).toBe('not_your_challenge');
    const accepted = (await answer(OTHER, true)).json();
    expect(accepted.status).toBe('accepted');
    expect(accepted.fight.url).toMatch(new RegExp(`^${WEB_ORIGIN}/replay/`));
    expect(accepted.fight.rounds).toBeGreaterThan(0);
    expect(t.fights.fights).toHaveLength(1);
    // Beide Seiten werden belohnt und zählen fürs Tageslimit
    expect(accepted.fight.opponentReward).toMatchObject({ name: 'Trinity' });
    expect(accepted.fight.opponentReward.xp).toBeGreaterThan(0);
    const [, theirs] = t.fights.fights[0]!.participants;
    expect(theirs).toMatchObject({ rewarded: true, xpAwarded: accepted.fight.opponentReward.xp });
    const trinity = t.characters.records.find((c) => c.name === 'Trinity')!;
    expect(trinity.xp).toBe(accepted.fight.opponentReward.xp);
    // Kein zweiter Kampf aus derselben Anfrage
    expect((await answer(OTHER, true)).json().code).toBe('challenge_closed');

    const missing = await bot('POST', 'challenge', {
      userId: USER,
      displayName: 'Neo',
      opponentUserId: '999999999999',
      mode: 'rated',
    });
    expect(missing.json().code).toBe('opponent_not_found');
  });

  it('lässt Anfragen ablehnen und ablaufen', async () => {
    await setup();
    await bot('POST', 'register', {
      guildId: GUILD,
      userId: OTHER,
      displayName: 'Trin',
      name: 'Trinity',
      classId: 'bruiser',
    });
    const ask = async () =>
      (
        await bot('POST', 'challenge', {
          userId: USER,
          displayName: 'Neo',
          opponentUserId: OTHER,
          mode: 'friendly',
        })
      ).json();
    const first = await ask();
    const declined = await bot('POST', 'challenge-answer', {
      userId: OTHER,
      displayName: 'Trin',
      requestId: first.id,
      accept: false,
    });
    expect(declined.json()).toMatchObject({ status: 'declined', fight: null });

    const second = await ask();
    expect(second.id).not.toBe(first.id);
    t.time.tick(16 * 60 * 1000);
    const late = await bot('POST', 'challenge-answer', {
      userId: OTHER,
      displayName: 'Trin',
      requestId: second.id,
      accept: true,
    });
    expect(late.json().code).toBe('challenge_expired');
    expect(t.fights.fights).toHaveLength(0);
  });
});

describe('Liga über Discord', () => {
  const HOUR = 60 * 60 * 1000;
  /** Weitere platzierte und angemeldete Spieler, alle mit Heimat im Test-Server. */
  async function players(n: number) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const userId = `55555555555555555${i}`;
      const created = (
        await bot('POST', 'register', {
          guildId: GUILD,
          userId,
          displayName: `P${i}`,
          name: `Runner${i}`,
          classId: 'bruiser',
        })
      ).json();
      t.league.ratingRows.set(created.id, {
        characterId: created.id,
        seasonId: t.seasons.current!.id,
        rating: 1500 + i,
        rd: 100,
        volatility: 0.06,
        games: 5,
        wins: 3,
        losses: 2,
        draws: 0,
        leagueJoined: true,
      });
      ids.push(created.id);
    }
    return ids;
  }

  it('zeigt den Stand, meldet an und platziert', async () => {
    await setup();
    await players(2);
    const status = (
      await bot('POST', 'league', { userId: USER, displayName: 'Neo', action: 'status' })
    ).json();
    expect(status).toMatchObject({ rating: null, placementLeft: 5, joined: false, division: null });
    expect(status.url).toBe(`${WEB_ORIGIN}/fight/league`);
    const placed = (
      await bot('POST', 'league', { userId: USER, displayName: 'Neo', action: 'placement' })
    ).json();
    expect(placed.placementLeft).toBe(4);
    expect(placed.fight.url).toContain('/replay/');
    const joined = (
      await bot('POST', 'league', { userId: USER, displayName: 'Neo', action: 'join' })
    ).json();
    expect(joined.joined).toBe(true);
  });

  it('kündigt gespielte Spieltage im Liga-Kanal der Heimat-Community an, jeweils einmal', async () => {
    await setup();
    await players(4);
    await bot('POST', 'league-channel', { guildId: GUILD, channelId: CHANNEL, enabled: true });
    expect((await job('league-tick')).json().cyclesStarted).toBe(1);
    expect((await bot('POST', 'league-news')).json()).toEqual([]);

    t.time.tick(9 * HOUR); // 21:00 – Spieltag 1 ist gespielt
    expect((await job('league-tick')).json().played).toBe(2);
    const news = (await bot('POST', 'league-news')).json();
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ guildId: GUILD, channelId: CHANNEL });
    expect(news[0].items[0]).toMatchObject({ kind: 'matchday', cycle: 1, matchday: 1 });
    expect(news[0].items[0].results).toHaveLength(2);
    // Schon angekündigt
    expect((await bot('POST', 'league-news')).json()).toEqual([]);

    // Bis zum Zyklusende vorspulen: drei Spieltage, danach das Abschluss-Ranking
    t.time.tick(2 * 24 * HOUR);
    await job('league-tick');
    const rest = (await bot('POST', 'league-news')).json()[0].items;
    expect(rest.map((i: { kind: string }) => i.kind)).toEqual([
      'matchday',
      'matchday',
      'cycle_end',
    ]);
    expect(rest[2].rows).toHaveLength(4);

    // Abschalten: keine Ankündigungen mehr
    await bot('POST', 'league-channel', { guildId: GUILD, channelId: CHANNEL, enabled: false });
    t.time.tick(24 * HOUR);
    await job('league-tick');
    expect((await bot('POST', 'league-news')).json()).toEqual([]);
  });
});
