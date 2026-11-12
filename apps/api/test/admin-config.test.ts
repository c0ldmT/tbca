import { DEFAULT_GAME_CONFIG, defaultLoadout } from '@tbca/game-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

type Auth = { cookie: string; csrfToken: string };
let t: TestApp;
let admin: Auth;

function call(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
  return t.app.inject({
    method,
    url,
    cookies: { tbca_session: admin.cookie },
    headers: { 'x-csrf-token': admin.csrfToken, origin: WEB_ORIGIN },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

beforeEach(async () => {
  t = await createTestApp();
  admin = await login(t, '100');
  t.accounts.roles.set([...t.accounts.accounts.keys()][0]!, 'superadmin');
});

afterEach(async () => {
  await t.app.close();
});

describe('Season-Konfiguration', () => {
  it('legt einen Entwurf aus den Startwerten des Codes an', async () => {
    t.configs.versions[0]!.data.game = { ...DEFAULT_GAME_CONFIG, maxLevel: 50 };
    const draft = (
      await call('POST', '/api/admin/config/drafts', { from: 'defaults', notes: 'Rebalancing' })
    ).json();
    expect(draft.status).toBe('draft');
    expect(draft.data.game.maxLevel).toBe(DEFAULT_GAME_CONFIG.maxLevel);
    expect(draft.data.game.stats.initiative).toEqual(DEFAULT_GAME_CONFIG.stats.initiative);
    expect(t.admin.entries[0]).toMatchObject({
      action: 'config.draft',
      data: { from: 'defaults' },
    });
  });

  it('legt einen Entwurf an, prüft Änderungen und veröffentlicht ihn', async () => {
    const draft = (
      await call('POST', '/api/admin/config/drafts', { from: null, notes: 'Neue Waffe' })
    ).json();
    expect(draft).toMatchObject({ version: 3, status: 'draft' });

    const game = structuredClone(DEFAULT_GAME_CONFIG) as unknown as {
      items: { templates: object[] };
    };
    game.items.templates.push({
      id: 'katana',
      category: 'weapon_2h',
      weapon: { kind: 'physical', scalesWith: 'dex', scaling: 9_500 },
      base: { weaponDamage: 1 },
      affixPool: ['dex', 'critChance'],
    });
    const saved = await call('PUT', '/api/admin/config/3', {
      data: { battle: draft.data.battle, game },
      notes: 'Katana',
    });
    expect(saved.statusCode).toBe(200);

    const broken = structuredClone(game);
    broken.items.templates.push({ id: 'katana', category: 'weapon_9h', base: {}, affixPool: [] });
    const invalid = (
      await call('PUT', '/api/admin/config/3', {
        data: { battle: draft.data.battle, game: broken },
        notes: null,
      })
    ).json();
    expect(invalid.code).toBe('invalid_config');
    expect(invalid.problems).toContain('Vorlage katana: ID ist doppelt');

    const list = (await call('POST', '/api/admin/config/3/publish')).json();
    expect(
      list.versions.map((v: { version: number; status: string }) => [v.version, v.status]),
    ).toEqual([
      [3, 'published'],
      [2, 'archived'],
    ]);
    expect(
      (
        await call('PUT', '/api/admin/config/3', {
          data: { battle: draft.data.battle, game },
          notes: null,
        })
      ).json().code,
    ).toBe('config_not_draft');
    expect(t.admin.entries.map((e) => e.action)).toEqual([
      'config.publish',
      'config.update',
      'config.draft',
    ]);
  });
});

describe('Balancing-Simulation', () => {
  it('simuliert die Matrix gegen die veröffentlichte Version und einen Entwurf', async () => {
    const res = (
      await call('POST', '/api/admin/simulations', {
        kind: 'matchups',
        level: 10,
        gear: 'common',
        samples: 2,
      })
    ).json();
    expect(res.status).toBe('published');
    expect(res.matchups.cells).toHaveLength(16);
    expect(res.dungeon).toBeNull();

    const draft = (
      await call('POST', '/api/admin/config/drafts', { from: null, notes: null })
    ).json();
    const dungeon = (
      await call('POST', '/api/admin/simulations', {
        kind: 'dungeon',
        version: draft.version,
        level: 10,
        gear: 'none',
        samples: 2,
      })
    ).json();
    expect(dungeon).toMatchObject({ version: draft.version, status: 'draft' });
    expect(dungeon.dungeon.runs).toBe(8);
  });

  it('begrenzt die Stichprobe und ist nur für Superadmins', async () => {
    const tooMany = await call('POST', '/api/admin/simulations', {
      kind: 'matchups',
      level: 10,
      gear: 'none',
      samples: 5000,
    });
    expect(tooMany.statusCode).toBe(400);
    t.accounts.roles.clear();
    const denied = await call('POST', '/api/admin/simulations', {
      kind: 'matchups',
      level: 10,
      gear: 'none',
      samples: 2,
    });
    expect(denied.statusCode).toBe(403);
  });
});

describe('Bot-Spieler', () => {
  it('handeln mit Agententyp nur in Test-Seasons', async () => {
    const seasonId = t.seasons.current!.id;
    for (const [i, classId] of (['gunner', 'bruiser', 'netrunner'] as const).entries()) {
      t.characters.records.push({
        id: `01933b5e-0000-7000-8000-00000000b00${i}`,
        accountId: `01933b5e-0000-7000-8000-00000000a00${i}`,
        seasonId,
        name: `Bot${i}`,
        classId,
        level: 3,
        xp: 300,
        allocated: { str: 0, dex: 0, int: 0, con: 0 },
        loadouts: { [classId]: defaultLoadout(DEFAULT_GAME_CONFIG, classId, 3) },
        isBot: true,
      });
    }
    const bots = (await call('GET', '/api/admin/bots')).json();
    expect(bots).toHaveLength(3);
    await call('PUT', `/api/admin/bots/${bots[0].accountId}`, { agent: 'active' });
    await call('PUT', `/api/admin/bots/${bots[1].accountId}`, { agent: 'class_switcher' });

    const run = (await call('POST', '/api/admin/bots/run')).json();
    expect(run).toMatchObject({ acted: 2, errors: {} });
    expect(run.actions).toBeGreaterThanOrEqual(3);
    expect(t.fights.fights.length).toBeGreaterThanOrEqual(3);
    // Freie Punkte wurden verteilt (Level 3 = 15 Punkte).
    const active = t.characters.records.find((c) => c.accountId === bots[0].accountId)!;
    expect(Object.values(active.allocated).reduce((a, b) => a + b, 0)).toBe(active.level * 5);

    t.seasons.current = { ...t.seasons.current!, isTest: false };
    expect((await call('POST', '/api/admin/bots/run')).json()).toMatchObject({
      acted: 0,
      skipped: 'real_season',
    });
  });
});
