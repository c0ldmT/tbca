import { describe, expect, it, vi } from 'vitest';

import { fingerprint } from '../src/activity.js';
import { ApiClient } from '../src/api-client.js';
import { allCommands } from '../src/commands.js';
import {
  deliverLeagueNews,
  handleButton,
  handleCommand,
  handleMessage,
  type CommandInput,
} from '../src/handlers.js';

function fakeFetch(responses: Record<string, { status: number; body: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const path = String(url).split('/internal/discord/')[1]!.split('?')[0]!;
    const r = responses[path] ?? { status: 500, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const input = (
  overrides: Partial<CommandInput> & { opts?: Record<string, unknown> } = {},
): CommandInput => ({
  command: 'tbca',
  subcommand: 'profil',
  guildId: '111111111111111111',
  guildName: 'Night City',
  channelId: '222222222222222222',
  userId: '333333333333333333',
  displayName: 'Neo',
  locale: 'de',
  options: {
    string: (n) => (overrides.opts?.[n] as string) ?? null,
    user: (n) => (overrides.opts?.[n] as { id: string; bot: boolean }) ?? null,
    channel: (n) => (overrides.opts?.[n] as { id: string }) ?? null,
    boolean: (n) => (overrides.opts?.[n] as boolean) ?? null,
    integer: (n) => (overrides.opts?.[n] as number) ?? null,
  },
  ...overrides,
});

describe('Discord-Bot', () => {
  it('schickt nie den Nachrichtentext, nur Länge und Hash', async () => {
    const { fn, calls } = fakeFetch({
      activity: { status: 200, body: { awarded: 20, reason: 'ok', levelUp: null } },
    });
    const api = new ApiClient('http://api', 's'.repeat(40), fn);
    await handleMessage(api, {
      id: '1234567890',
      guildId: '111111111111111111',
      channelId: '222222222222222222',
      authorId: '333333333333333333',
      authorBot: false,
      displayName: 'Neo',
      content: 'Geheime Nachricht mit Inhalt',
    });
    const body = String(calls[0]!.init.body);
    expect(body).not.toContain('Geheime');
    expect(JSON.parse(body)).toMatchObject({ eventId: '1234567890', length: 25 });
    expect(calls[0]!.init.headers).toMatchObject({ authorization: `Bearer ${'s'.repeat(40)}` });
  });

  it('erkennt nahezu gleiche Nachrichten als gleich', () => {
    expect(fingerprint('GG!!').hash).toBe(fingerprint('g g').hash);
    expect(fingerprint('Hallo Welt').hash).not.toBe(fingerprint('Hallo Leute').hash);
  });

  it('ignoriert Bots und Direktnachrichten', async () => {
    const { fn, calls } = fakeFetch({});
    const api = new ApiClient('http://api', 's'.repeat(40), fn);
    const base = {
      id: '1',
      channelId: '2',
      authorId: '3',
      displayName: 'X',
      content: 'hallo welt',
    };
    await handleMessage(api, { ...base, guildId: '4', authorBot: true });
    await handleMessage(api, { ...base, guildId: null, authorBot: false });
    expect(calls).toHaveLength(0);
  });

  it('stellt eine Herausforderung als Anfrage mit Buttons für den Gegner', async () => {
    const { fn } = fakeFetch({
      challenge: {
        status: 200,
        body: {
          id: '01933b5e-0000-7000-8000-000000000777',
          challenger: 'Neo',
          opponent: 'Trinity',
          opponentUserId: '444444444444444444',
          mode: 'rated',
          expiresAt: '2026-11-12T11:15:00.000Z',
        },
      },
    });
    const reply = await handleCommand(
      new ApiClient('http://api', 's'.repeat(40), fn),
      input({ subcommand: 'kampf', opts: { gegner: { id: '444444444444444444', bot: false } } }),
    );
    expect(reply.ephemeral).toBe(false);
    expect(reply.content).toContain('**Neo** fordert **Trinity** heraus (gewertet)');
    expect(reply.content).toContain('<t:1794482100:R>');
    expect(reply.ping).toBe('444444444444444444');
    expect(reply.buttons?.map((b) => b.customId)).toEqual([
      'ch:accept:01933b5e-0000-7000-8000-000000000777:444444444444444444',
      'ch:decline:01933b5e-0000-7000-8000-000000000777:444444444444444444',
    ]);
  });

  it('lässt nur den Herausgeforderten annehmen und zeigt dann den Kampf', async () => {
    const { fn, calls } = fakeFetch({
      'challenge-answer': {
        status: 200,
        body: {
          status: 'accepted',
          challenger: 'Neo',
          opponent: 'Trinity',
          fight: {
            winner: 'Neo',
            rounds: 9,
            bestHit: { name: 'Neo', value: 84 },
            xp: 60,
            credits: 12,
            limit: 'none',
            levelUp: 2,
            opponentReward: { name: 'Trinity', xp: 15, credits: 3 },
            url: 'https://tbca/replay/x',
          },
        },
      },
    });
    const api = new ApiClient('http://api', 's'.repeat(40), fn);
    const id = 'ch:accept:01933b5e-0000-7000-8000-000000000777:444444444444444444';
    const other = await handleButton(api, {
      customId: id,
      userId: '333333333333333333',
      displayName: 'Neo',
      locale: 'de',
    });
    expect(other).toMatchObject({ ephemeral: true });
    expect(calls).toHaveLength(0);
    const reply = await handleButton(api, {
      customId: id,
      userId: '444444444444444444',
      displayName: 'Trin',
      locale: 'de',
    });
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ accept: true });
    expect(reply.content).toContain('**Trinity** nimmt an!');
    expect(reply.content).toContain('**Neo** gewinnt nach 9 Runden');
    expect(reply.content).toContain('Trinity: +15 XP, +3 Credits');
    expect(reply.content).toContain('https://tbca/replay/x');
    expect(reply.buttons).toEqual([]);
  });

  it('übersetzt Fehlercodes der API in die Sprache des Nutzers', async () => {
    const { fn } = fakeFetch({ profile: { status: 404, body: { code: 'not_registered' } } });
    const api = new ApiClient('http://api', 's'.repeat(40), fn);
    expect((await handleCommand(api, input())).content).toContain('/tbca registrieren');
    expect((await handleCommand(api, input({ locale: 'en-US' }))).content).toContain(
      "You don't have a character",
    );
  });

  it('meldet eine nicht erreichbare API verständlich', async () => {
    const api = new ApiClient('http://api', 's'.repeat(40), (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch);
    expect((await handleCommand(api, input())).content).toContain('nicht erreichbar');
  });

  it('definiert Spieler- und Admin-Commands', () => {
    expect(allCommands.map((c) => c.name)).toEqual(['tbca', 'tbca-admin']);
    expect(allCommands[1]!.default_member_permissions).toBe('32'); // ManageGuild
  });

  const dungeonView = (overrides: Record<string, unknown> = {}) => ({
    status: 'active',
    floor: 3,
    hp: 200,
    maxHp: 400,
    injectors: 1,
    finds: 3,
    credits: 0,
    items: [],
    xpGained: 120,
    next: { floor: 4, monsterLevel: 12, boss: false },
    lastFloor: null,
    runsLeft: 2,
    fee: 7,
    canHeal: true,
    url: 'https://tbca.example/fight/dungeon',
    ...overrides,
  });

  it('zeigt den Dungeon mit Buttons, die Start-Optionen mitführen', async () => {
    const { fn } = fakeFetch({ dungeon: { status: 200, body: dungeonView({ status: 'none' }) } });
    const api = new ApiClient('http://api', 't'.repeat(40), fn);
    const reply = await handleCommand(
      api,
      input({ subcommand: 'dungeon', opts: { injektoren: 2, 'backup-chip': true } }),
    );
    expect(reply.content).toContain('Kein aktiver Run');
    expect(reply.buttons).toEqual([
      expect.objectContaining({ customId: 'dg:start:333333333333333333:2:1' }),
    ]);
  });

  it('verbirgt den Loot im laufenden Run und bietet Weiter, Raus und Heilen an', async () => {
    const { fn, calls } = fakeFetch({ dungeon: { status: 200, body: dungeonView() } });
    const api = new ApiClient('http://api', 't'.repeat(40), fn);
    const reply = await handleButton(api, {
      customId: 'dg:continue:333333333333333333',
      userId: '333333333333333333',
      displayName: 'Neo',
      locale: 'de',
    });
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ action: 'continue' });
    expect(reply.content).toContain('3 versiegelte Funde');
    expect(reply.buttons?.map((b) => b.customId.split(':')[1])).toEqual([
      'continue',
      'leave',
      'heal',
    ]);
  });

  it('nennt Loot-Items beim Namen in der Sprache des Nutzers', async () => {
    const left = dungeonView({
      status: 'left',
      next: null,
      credits: 40,
      items: [
        {
          templateId: 'core_implant',
          rarity: 5,
          names: { de: 'Kern-Implantat', en: 'Core implant' },
        },
      ],
    });
    const { fn } = fakeFetch({ dungeon: { status: 200, body: left } });
    const api = new ApiClient('http://api', 't'.repeat(40), fn);
    const user = {
      customId: 'dg:leave:333333333333333333',
      userId: '333333333333333333',
      displayName: 'Neo',
    };
    expect((await handleButton(api, { ...user, locale: 'de' })).content).toContain(
      'Kern-Implantat ★5',
    );
    expect((await handleButton(api, { ...user, locale: 'en-US' })).content).toContain(
      'Core implant ★5',
    );
  });

  it('lässt nur den Besitzer eines Runs entscheiden', async () => {
    const { fn, calls } = fakeFetch({});
    const api = new ApiClient('http://api', 't'.repeat(40), fn);
    const reply = await handleButton(api, {
      customId: 'dg:leave:333333333333333333',
      userId: '444444444444444444',
      displayName: 'Trin',
      locale: 'de',
    });
    expect(reply).toMatchObject({ ephemeral: true });
    expect(calls).toHaveLength(0);
  });

  it('fordert mit dem Team per Kürzel heraus; der gegnerische Kapitän entscheidet', async () => {
    const { fn, calls } = fakeFetch({
      'team-challenge': {
        status: 200,
        body: {
          id: '01933b5e-0000-7000-8000-000000000888',
          ownTag: 'CHW',
          opponentTag: 'NEON',
          size: 3,
          mode: 'rated',
          captainUserId: '444444444444444444',
          expiresAt: '2026-11-12T11:15:00.000Z',
        },
      },
      'team-challenge-answer': {
        status: 200,
        body: {
          status: 'accepted',
          ownTag: 'CHW',
          opponentTag: 'NEON',
          fight: {
            ownTag: 'CHW',
            opponentTag: 'NEON',
            size: 3,
            won: true,
            draw: false,
            rewards: [{ name: 'Neo', xp: 90, credits: 12 }],
            opponentRewards: [{ name: 'Trinity', xp: 20, credits: 4 }],
            replayUrl: 'https://tbca.example/replay/x',
          },
        },
      },
    });
    const api = new ApiClient('http://api', 't'.repeat(40), fn);
    const reply = await handleCommand(
      api,
      input({ subcommand: 'team-kampf', opts: { gegner: 'neon', groesse: 3 } }),
    );
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({
      opponentTag: 'neon',
      size: 3,
      mode: 'rated',
    });
    expect(reply.content).toContain('**[CHW]** fordert **[NEON]** zum 3v3 heraus (gewertet)');
    expect(reply.ping).toBe('444444444444444444');
    expect(reply.buttons?.map((b) => b.customId)).toEqual([
      'tc:accept:01933b5e-0000-7000-8000-000000000888',
      'tc:decline:01933b5e-0000-7000-8000-000000000888',
    ]);

    const answer = await handleButton(api, {
      customId: 'tc:accept:01933b5e-0000-7000-8000-000000000888',
      userId: '444444444444444444',
      displayName: 'Trin',
      locale: 'de',
    });
    expect(JSON.parse(String(calls[1]!.init.body))).toMatchObject({
      requestId: '01933b5e-0000-7000-8000-000000000888',
      accept: true,
    });
    expect(answer.content).toContain('**[NEON]** nimmt an!');
    expect(answer.content).toContain('Sieg!');
    expect(answer.content).toContain('Neo: +90 XP');
    expect(answer.content).toContain('Trinity: +20 XP');
    expect(answer.buttons).toEqual([]);
  });

  it('meldet, wenn nicht der Kapitän eine Team-Herausforderung beantwortet', async () => {
    const { fn } = fakeFetch({
      'team-challenge-answer': { status: 403, body: { code: 'not_captain' } },
    });
    const reply = await handleButton(new ApiClient('http://api', 't'.repeat(40), fn), {
      customId: 'tc:decline:01933b5e-0000-7000-8000-000000000888',
      userId: '555555555555555555',
      displayName: 'Mo',
      locale: 'en-US',
    });
    expect(reply).toMatchObject({ ephemeral: true });
    expect(reply.content).toContain('Only the captain');
  });

  const leagueView = (overrides: Record<string, unknown> = {}) => ({
    rating: 1532,
    games: 3,
    placementLeft: 2,
    joined: false,
    division: null,
    next: null,
    fight: null,
    url: 'https://tbca.example/fight/league',
    ...overrides,
  });

  it('zeigt die Liga mit Platzierungs- und Anmelde-Button', async () => {
    const { fn } = fakeFetch({ league: { status: 200, body: leagueView() } });
    const api = new ApiClient('http://api', 't'.repeat(40), fn);
    const reply = await handleCommand(api, input({ subcommand: 'liga' }));
    expect(reply.content).toContain('Rating **1532**');
    expect(reply.content).toContain('noch 2 gewertete Kämpfe');
    expect(reply.buttons?.map((b) => b.customId)).toEqual([
      'lg:placement:333333333333333333',
      'lg:join:333333333333333333',
    ]);
  });

  it('führt Liga-Buttons nur für den Besitzer aus', async () => {
    const placed = leagueView({
      placementLeft: 0,
      joined: true,
      division: { index: 2, count: 3, place: 1, points: 9, size: 8 },
      next: { matchday: 4, playAt: '2026-11-13T19:00:00.000Z', locked: true },
    });
    const { fn, calls } = fakeFetch({ league: { status: 200, body: placed } });
    const api = new ApiClient('http://api', 't'.repeat(40), fn);
    const foreign = await handleButton(api, {
      customId: 'lg:join:333333333333333333',
      userId: '444444444444444444',
      displayName: 'Trin',
      locale: 'de',
    });
    expect(foreign.content).toContain('nicht deine Liga');
    expect(calls).toHaveLength(0);
    const reply = await handleButton(api, {
      customId: 'lg:join:333333333333333333',
      userId: '333333333333333333',
      displayName: 'Neo',
      locale: 'en-US',
    });
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ action: 'join' });
    expect(reply.content).toContain('Division 2 of 3: place 1 of 8, 9 points');
    expect(reply.content).toContain('<t:1794596400:f>');
    expect(reply.buttons?.map((b) => b.customId)).toEqual(['lg:leave:333333333333333333']);
  });

  it('setzt den Liga-Kanal und verschickt Ankündigungen in der Sprache des Servers', async () => {
    const { fn } = fakeFetch({
      'league-channel': { status: 200, body: { name: 'Night City' } },
      'league-news': {
        status: 200,
        body: [
          {
            guildId: '111111111111111111',
            channelId: '222222222222222222',
            url: 'https://tbca.example/fight/league',
            items: [
              {
                kind: 'matchday',
                cycle: 1,
                matchday: 2,
                playAt: '2026-11-13T19:00:00.000Z',
                results: [
                  { a: 'Neo', b: 'Trin', winner: 'Neo', url: 'https://tbca.example/replay/x' },
                ],
              },
              {
                kind: 'cycle_end',
                cycle: 1,
                rows: [{ name: 'Neo', division: 2, place: 1, movement: 'up' }],
              },
              {
                kind: 'cycle_end',
                team: 3,
                cycle: 2,
                rows: [{ name: '[CHW] Chrome Wolves', division: 1, place: 2, movement: 'stay' }],
              },
            ],
          },
        ],
      },
    });
    const api = new ApiClient('http://api', 't'.repeat(40), fn);
    const admin = await handleCommand(
      api,
      input({
        command: 'tbca-admin',
        subcommand: 'liga-kanal',
        opts: { kanal: { id: '222222222222222222' }, aktiv: true },
      }),
    );
    expect(admin.content).toContain('Liga-Ankündigungen');
    const sent: string[] = [];
    const n = await deliverLeagueNews(
      api,
      async (target, content) => {
        expect(target.channelId).toBe('222222222222222222');
        sent.push(content);
      },
      () => 'de',
    );
    expect(n).toBe(1);
    expect(sent[0]).toContain('Spieltag 2');
    expect(sent[0]).toContain('**Neo** gewinnt');
    expect(sent[0]).toContain('Platz 1 – Aufstieg ▲');
    expect(sent[0]).toContain('**Team-Liga 3v3 · Zyklus 2 beendet**');
    expect(sent[0]).toContain('[CHW] Chrome Wolves: Division 1, Platz 2');
  });
});
