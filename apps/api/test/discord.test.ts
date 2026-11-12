import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

let t: TestApp;
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

  it('fordert registrierte Spieler heraus und fasst den Kampf zusammen', async () => {
    await setup();
    await bot('POST', 'register', {
      guildId: GUILD,
      userId: OTHER,
      displayName: 'Trin',
      name: 'Trinity',
      classId: 'bruiser',
    });
    const res = (
      await bot('POST', 'challenge', {
        userId: USER,
        displayName: 'Neo',
        opponentUserId: OTHER,
        mode: 'rated',
      })
    ).json();
    expect(res.url).toMatch(new RegExp(`^${WEB_ORIGIN}/replay/`));
    expect(res.rounds).toBeGreaterThan(0);
    expect(res.bestHit.value).toBeGreaterThan(0);
    const missing = await bot('POST', 'challenge', {
      userId: USER,
      displayName: 'Neo',
      opponentUserId: '999999999999',
      mode: 'rated',
    });
    expect(missing.json().code).toBe('opponent_not_found');
  });
});
