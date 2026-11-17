import { rollItem, DEFAULT_GAME_CONFIG as config } from '@tbca/game-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

let t: TestApp;
let auth: { cookie: string; csrfToken: string };

function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
  return t.app.inject({
    method,
    url,
    cookies: { tbca_session: auth.cookie },
    headers: { 'x-csrf-token': auth.csrfToken, origin: WEB_ORIGIN },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

async function give(templateId: string, rarity: number, itemLevel = 10) {
  const me = t.characters.records[0]!;
  const data = rollItem(config, {
    templateId,
    itemLevel,
    rarity,
    seed: `${templateId}-${rarity}-${itemLevel}`,
  });
  const [id] = await t.inventory.addItems(me.accountId, me.seasonId, [{ data, source: 'test' }]);
  return { id: id!, data };
}

function fund(credits: number, stacks: Record<string, number> = {}) {
  const me = t.characters.records[0]!;
  t.characters.credit(me.seasonId, me.accountId, credits);
  t.economy.stackMap.set(`${me.seasonId}:${me.accountId}`, stacks);
}

beforeEach(async () => {
  t = await createTestApp();
  auth = await login(t);
  await call('POST', '/api/characters', { name: 'Kira', classId: 'gunner' });
  await call('GET', '/api/inventory'); // Startausrüstung
});

afterEach(async () => {
  await t.app.close();
});

describe('Crafting', () => {
  it('zerlegt nur nicht ausgerüstete Items in Materialien', async () => {
    const item = await give('boots', 8, 30);
    const res = (await call('POST', '/api/crafting/salvage', { itemId: item.id })).json();
    expect(res).toMatchObject({
      success: true,
      gained: { scrap: 4, circuits: 2 },
      stacks: { scrap: 4, circuits: 2 },
    });
    const pistol = t.inventory.items.find((i) => i.data.templateId === 'pistol')!;
    expect((await call('POST', '/api/crafting/salvage', { itemId: pistol.id })).json().code).toBe(
      'item_equipped',
    );
  });

  it('wertet gegen Credits und Material auf', async () => {
    const item = await give('vest', 3);
    fund(1000, { scrap: 10 });
    const res = (await call('POST', '/api/crafting/upgrade', { itemId: item.id })).json();
    expect(res.success).toBe(true);
    expect(res.item.upgrade).toBe(1);
    expect(res.credits).toBe(1000 - (20 + 2 * 10 + 15));
    expect(res.stacks.scrap).toBe(9);
  });

  it('bucht nichts ab, wenn Material fehlt', async () => {
    const item = await give('vest', 3);
    fund(1000);
    expect((await call('POST', '/api/crafting/upgrade', { itemId: item.id })).json().code).toBe(
      'insufficient_materials',
    );
    expect((await call('GET', '/api/characters/me')).json().credits).toBe(1000);
  });

  it('überträgt Affixe und opfert den Spender', async () => {
    const target = await give('vest', 2);
    const donor = await give('boots', 8);
    fund(1000);
    const stat = donor.data.affixes.find(
      (a) => !target.data.affixes.some((b) => b.stat === a.stat),
    )!.stat;
    const res = await call('POST', '/api/crafting/transfer', {
      targetId: target.id,
      donorId: donor.id,
      stat,
    });
    expect(res.statusCode).toBe(200);
    expect(t.inventory.items.some((i) => i.id === donor.id)).toBe(false);
    if (res.json().success)
      expect(res.json().item.affixes.some((a: { stat: string }) => a.stat === stat)).toBe(true);
    expect(res.json().credits).toBe(1000 - (100 + 5 * 10));
  });

  it('würfelt einen Affix neu', async () => {
    const item = await give('vest', 8);
    fund(1000, { circuits: 5 });
    const res = (
      await call('POST', '/api/crafting/reroll', {
        itemId: item.id,
        stat: item.data.affixes[0]!.stat,
      })
    ).json();
    expect(res.item.affixes).toHaveLength(item.data.affixes.length);
    expect(res.stacks.circuits).toBe(2);
  });
});

describe('Shop', () => {
  it('zeigt Verbrauchsgüter und eine tägliche Rotation auf dem eigenen Level', async () => {
    const shop = (await call('GET', '/api/shop')).json();
    expect(shop.consumables.map((c: { offerId: string }) => c.offerId)).toEqual([
      'heal_injector',
      'backup_chip',
    ]);
    expect(shop.rotation).toHaveLength(4);
    expect(
      shop.rotation.every(
        (o: { item: { itemLevel: number; rarity: number } }) =>
          o.item.itemLevel === 1 && o.item.rarity <= 6,
      ),
    ).toBe(true);
    // Gleicher Tag, gleiche Angebote.
    expect((await call('GET', '/api/shop')).json().rotation).toEqual(shop.rotation);
  });

  it('verkauft Verbrauchsgüter und Rotationsangebote nur mit genug Credits', async () => {
    expect((await call('POST', '/api/shop/buy', { offerId: 'backup_chip' })).json().code).toBe(
      'insufficient_credits',
    );
    fund(5000);
    const afterChip = (await call('POST', '/api/shop/buy', { offerId: 'backup_chip' })).json();
    expect(afterChip.stacks.backup_chip).toBe(1);
    expect(afterChip.credits).toBe(4600);

    const offer = afterChip.rotation[0];
    const bought = (await call('POST', '/api/shop/buy', { offerId: offer.offerId })).json();
    expect(bought.rotation[0].sold).toBe(true);
    expect(bought.credits).toBe(4600 - offer.price);
    expect((await call('POST', '/api/shop/buy', { offerId: offer.offerId })).json().code).toBe(
      'already_purchased',
    );
  });

  it('kauft Items für 20 % ihres Werts an', async () => {
    const item = await give('rifle', 5);
    const shop = (await call('POST', '/api/shop/sell', { itemId: item.id })).json();
    expect(shop.credits).toBe(Math.floor(item.data.budget * 5 * 0.2));
    expect(t.inventory.items.some((i) => i.id === item.id)).toBe(false);
  });
});
