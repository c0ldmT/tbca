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

function fund(credits: number, stacks: Record<string, number> = {}) {
  const me = t.characters.records[0]!;
  t.characters.credit(me.seasonId, me.accountId, credits);
  t.economy.stackMap.set(`${me.seasonId}:${me.accountId}`, stacks);
}

const start = (injectors = 0, backupChip = false) =>
  call('POST', '/api/dungeon/start', { injectors, backupChip });

/** Läuft weiter, bis der Run endet; liefert die letzte Ansicht. */
async function runToEnd() {
  let view = (await call('GET', '/api/dungeon')).json();
  for (let i = 0; i < 40 && view.run?.status === 'active'; i++)
    view = (await call('POST', '/api/dungeon/continue')).json();
  return view;
}

beforeEach(async () => {
  t = await createTestApp();
  auth = await login(t);
  await call('POST', '/api/characters', { name: 'Kira', classId: 'bruiser' });
});

afterEach(async () => {
  await t.app.close();
});

describe('Dungeon', () => {
  it('kostet Eintritt, kämpft Etage 1 und merkt Loot bis zum Verlassen vor', async () => {
    fund(100);
    const view = (await start()).json();
    expect(view.runsToday).toBe(1);
    expect((await call('GET', '/api/characters/me')).json().credits).toBe(100 - 7);
    if (view.run.status === 'active') {
      expect(view.run.floor).toBe(1);
      expect(view.run.loot.items.length).toBeGreaterThan(0);
      expect(view.run.next).toMatchObject({ floor: 2 });
      const itemsBefore = t.inventory.items.length;
      const left = (await call('POST', '/api/dungeon/leave')).json();
      expect(left.run.status).toBe('left');
      expect(t.inventory.items.length).toBe(itemsBefore + view.run.loot.items.length);
      expect((await call('GET', '/api/characters/me')).json().xp).toBe(view.run.xpGained);
    } else {
      expect(view.run.status).toBe('defeated');
    }
  });

  it('verliert bei einer Niederlage den Run-Loot, außer der Backup-Chip rettet ihn', async () => {
    fund(1000, { backup_chip: 1 });
    // Ohne Chip bis zur Niederlage: kein Loot ins Inventar.
    const itemsBefore = t.inventory.items.length;
    await start();
    const lost = await runToEnd();
    expect(lost.run.status).toBe('defeated');
    expect(t.inventory.items.length).toBe(itemsBefore);
    // Mit Chip: Loot bleibt, Chip ist weg.
    await start(0, true);
    const saved = await runToEnd();
    expect(saved.run.status).toBe('saved');
    expect(t.inventory.items.length).toBe(itemsBefore + saved.run.loot.items.length);
    expect(saved.stacks.backup_chip ?? 0).toBe(0);
  });

  it('gibt Backup-Chip und unbenutzte Injektoren beim Verlassen zurück und heilt mit Injektoren', async () => {
    fund(1000, { backup_chip: 1, heal_injector: 3 });
    const view = (await start(2, true)).json();
    if (view.run.status !== 'active') return; // Etage 1 verloren – selten, aber möglich
    expect(view.stacks).toMatchObject({ heal_injector: 1 });
    const healed = (await call('POST', '/api/dungeon/heal')).json();
    expect(healed.run.injectors).toBe(1);
    expect(healed.run.hp).toBeGreaterThanOrEqual(view.run.hp);
    const left = (await call('POST', '/api/dungeon/leave')).json();
    expect(left.stacks).toMatchObject({ backup_chip: 1, heal_injector: 2 });
  });

  it('erlaubt 3 Runs pro Tag und nur einen gleichzeitig', async () => {
    fund(1000);
    await start();
    if ((await call('GET', '/api/dungeon')).json().run.status === 'active') {
      expect((await start()).json().code).toBe('run_active');
      await call('POST', '/api/dungeon/leave');
    }
    await start();
    await call('POST', '/api/dungeon/leave');
    await start();
    await call('POST', '/api/dungeon/leave');
    expect((await start()).json().code).toBe('no_runs_left');
    t.time.tick(24 * 60 * 60 * 1000);
    expect((await start()).statusCode).toBe(200);
  });

  it('verlässt den Dungeon nach 10 Minuten ohne Entscheidung automatisch mit Loot', async () => {
    fund(100);
    const view = (await start()).json();
    if (view.run.status !== 'active') return;
    t.time.tick(11 * 60 * 1000);
    const later = (await call('GET', '/api/dungeon')).json();
    expect(later.run.status).toBe('timed_out');
    expect(t.inventory.items.filter((i) => i.source === 'dungeon')).toHaveLength(
      view.run.loot.items.length,
    );
  });

  it('prüft Credits und Vorräte beim Start', async () => {
    expect((await start()).json().code).toBe('insufficient_credits');
    fund(100);
    expect((await start(1)).json().code).toBe('insufficient_materials');
    expect((await start(5)).json().code).toBe('too_many_injectors');
    expect((await call('POST', '/api/dungeon/continue')).json().code).toBe('no_active_run');
  });
});
