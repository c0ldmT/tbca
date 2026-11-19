import { describe, expect, it, vi } from 'vitest';

import { fingerprint } from '../src/activity.js';
import { ApiClient } from '../src/api-client.js';
import { allCommands } from '../src/commands.js';
import { handleCommand, handleMessage, type CommandInput } from '../src/handlers.js';

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

  it('fasst Kämpfe für den Chat zusammen', async () => {
    const { fn } = fakeFetch({
      challenge: {
        status: 200,
        body: {
          winner: 'Neo',
          rounds: 9,
          bestHit: { name: 'Neo', value: 84 },
          xp: 60,
          credits: 12,
          limit: 'none',
          levelUp: 2,
          url: 'https://tbca/replay/x',
        },
      },
    });
    const reply = await handleCommand(
      new ApiClient('http://api', 's'.repeat(40), fn),
      input({ subcommand: 'kampf', opts: { gegner: { id: '444444444444444444', bot: false } } }),
    );
    expect(reply.ephemeral).toBe(false);
    expect(reply.content).toContain('**Neo** gewinnt nach 9 Runden');
    expect(reply.content).toContain('+60 XP');
    expect(reply.content).toContain('Level 2');
    expect(reply.content).toContain('https://tbca/replay/x');
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
});
