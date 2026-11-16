import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

let t: TestApp;
let auth: { cookie: string; csrfToken: string };

function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
  return t.app.inject({
    method,
    url,
    cookies: { tbca_session: auth.cookie },
    headers: { 'x-csrf-token': auth.csrfToken, origin: WEB_ORIGIN },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

beforeEach(async () => {
  t = await createTestApp();
  auth = await login(t);
  await call('POST', '/api/characters', { name: 'Kira', classId: 'gunner' });
});

afterEach(async () => {
  await t.app.close();
});

describe('Inventar', () => {
  it('gibt neuen Charakteren eine Startausrüstung und rüstet sie aus', async () => {
    const inv = (await call('GET', '/api/inventory')).json();
    expect(inv.items.map((i: { templateId: string }) => i.templateId).sort()).toEqual([
      'pistol',
      'vest',
    ]);
    expect(Object.keys(inv.equipment).sort()).toEqual(['main_hand', 'torso']);
    const me = (await call('GET', '/api/characters/me')).json();
    expect(me.gear.main_hand.templateId).toBe('pistol');
    // Startausrüstung wird nur einmal vergeben.
    expect((await call('GET', '/api/inventory')).json().items).toHaveLength(2);
  });

  it('lässt Ausrüstung die Kampfwerte verändern', async () => {
    const before = (await call('GET', '/api/characters/me')).json();
    const vest = (await call('GET', '/api/inventory'))
      .json()
      .items.find((i: { templateId: string }) => i.templateId === 'vest');
    await call('DELETE', '/api/inventory/equipment/torso');
    const after = (await call('GET', '/api/characters/me')).json();
    expect(after.stats.armor).toBe(
      before.stats.armor - (vest.base.armor ?? 0) - sumAffix(vest, 'armor'),
    );
  });

  it('würfelt Test-Beute nur in Test-Seasons', async () => {
    const res = await call('POST', '/api/inventory/test-loot');
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ itemLevel: 1, source: 'test', equippedIn: null });
    t.seasons.current = { ...t.seasons.current!, isTest: false };
    expect((await call('POST', '/api/inventory/test-loot')).json().code).toBe('test_season_only');
  });

  it('prüft Plätze und macht beim Zweihänder die Nebenhand frei', async () => {
    const me = t.characters.records[0]!;
    const [rifle, shield, boots] = await t.inventory.addItems(me.accountId, me.seasonId, [
      { data: item('rifle', 'weapon_2h'), source: 'test' },
      { data: item('shield', 'shield'), source: 'test' },
      { data: item('boots', 'feet'), source: 'test' },
    ]);
    expect(
      (await call('PUT', '/api/inventory/equipment/head', { itemId: boots })).json().code,
    ).toBe('wrong_slot');
    await call('PUT', '/api/inventory/equipment/off_hand', { itemId: shield });
    const inv = (await call('PUT', '/api/inventory/equipment/main_hand', { itemId: rifle })).json();
    expect(inv.equipment).toMatchObject({ main_hand: rifle });
    expect(inv.equipment.off_hand).toBeUndefined();
    const blocked = await call('PUT', '/api/inventory/equipment/off_hand', { itemId: shield });
    expect(blocked.json().code).toBe('two_handed_blocks_off_hand');
    expect(
      (
        await call('PUT', '/api/inventory/equipment/feet', {
          itemId: '01933b5e-0000-7000-8000-00000000abcd',
        })
      ).statusCode,
    ).toBe(404);
    expect((await call('DELETE', '/api/inventory/equipment/nirgendwo')).json().code).toBe(
      'invalid_slot',
    );
  });

  it('nimmt die Ausrüstung mit in den Kampf', async () => {
    const res = await call('POST', '/api/pvp/training', { classId: 'bruiser', level: 1 });
    const stored = t.fights.fights.find((f) => f.id === res.json().fightId)!;
    const pistol = t.inventory.items.find((i) => i.data.templateId === 'pistol')!;
    expect(stored.input.teams[0]![0]!.attack.base).toBe(pistol.data.base.weaponDamage);
  });
});

function item(templateId: string, category: 'weapon_2h' | 'shield' | 'feet') {
  return {
    templateId,
    category,
    itemLevel: 1,
    rarity: 1,
    budget: 10,
    base: category === 'weapon_2h' ? { weaponDamage: 14 } : { armor: 3 },
    affixes: [],
  };
}

function sumAffix(i: { affixes: { stat: string; value: number }[] }, stat: string): number {
  return i.affixes.filter((a) => a.stat === stat).reduce((s, a) => s + a.value, 0);
}
