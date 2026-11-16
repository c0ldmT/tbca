/**
 * Drizzle-Repositories gegen eine echte PostgreSQL-Datenbank.
 * Läuft nur mit TBCA_TEST_DATABASE_URL (siehe packages/db/README.md).
 */
import { randomUUID } from 'node:crypto';

import {
  account,
  createDb,
  identity,
  runMigrations,
  seedDevelopment,
  type DbConnection,
} from '@tbca/db';
import {
  DEFAULT_GAME_CONFIG,
  defaultLoadout,
  deriveSnapshot,
  ENGINE_VERSION,
  rollItem,
  simulateBattle,
} from '@tbca/game-core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAccountRepository, DrizzleSessionStore } from '../src/auth/drizzle-repositories.js';
import { DrizzleCharacterRepository } from '../src/character/drizzle-character.repository.js';
import { CharacterExistsError, NameTakenError } from '../src/character/types.js';
import { DrizzleFightRepository } from '../src/fight/drizzle-fight.repository.js';
import { DrizzleInventoryRepository } from '../src/inventory/drizzle-inventory.repository.js';
import { DrizzleSeasonRepository } from '../src/game/season.js';

const url = process.env['TBCA_TEST_DATABASE_URL'];

describe.skipIf(!url)('Drizzle-Repositories (Integration)', () => {
  let conn: DbConnection;

  beforeAll(async () => {
    conn = createDb(url!, { maxConnections: 4, applicationName: 'tbca-api-test' });
    await runMigrations(conn.db);
    await seedDevelopment(conn.db);
  });

  afterAll(async () => {
    await conn?.close();
  });

  const profile = () => ({
    provider: 'discord' as const,
    providerUserId: `${Date.now()}${Math.floor(Math.random() * 1e6)}`,
    displayName: 'Trinity',
    avatarUrl: null,
  });

  it('legt beim ersten Login Account und Identität an und findet sie danach wieder', async () => {
    const repo = new DrizzleAccountRepository(conn.db);
    const p = profile();
    const first = await repo.loginWithIdentity(p, new Date());
    const second = await repo.loginWithIdentity({ ...p, displayName: 'Trinity 2' }, new Date());
    expect(second).toBe(first);

    const me = await repo.findProfile(first);
    expect(me).toEqual({
      account: { id: first, globalRole: 'player', locale: null },
      identities: [{ provider: 'discord', displayName: 'Trinity 2', avatarUrl: null }],
    });
    expect(await repo.findProfile(randomUUID())).toBeNull();
  });

  it('erzeugt bei gleichzeitigen Erst-Logins genau einen Account', async () => {
    const repo = new DrizzleAccountRepository(conn.db);
    const p = profile();
    const ids = await Promise.all(
      Array.from({ length: 4 }, () => repo.loginWithIdentity(p, new Date())),
    );
    expect(new Set(ids).size).toBe(1);
    const rows = await conn.db
      .select()
      .from(identity)
      .where(eq(identity.providerUserId, p.providerUserId));
    expect(rows).toHaveLength(1);
  });

  it('speichert Sessions, findet nur gültige und löscht sie', async () => {
    const [acc] = await conn.db.insert(account).values({}).returning();
    const store = new DrizzleSessionStore(conn.db);
    const now = new Date();
    const tokenHash = randomUUID();
    await store.create({
      accountId: acc!.id,
      tokenHash,
      csrfToken: 'csrf',
      expiresAt: new Date(now.getTime() + 60_000),
      now,
    });
    expect(await store.findValid(tokenHash, now)).toMatchObject({ accountId: acc!.id });
    expect(await store.findValid(tokenHash, new Date(now.getTime() + 120_000))).toBeNull();

    await store.extend(
      (await store.findValid(tokenHash, now))!.id,
      now,
      new Date(now.getTime() + 300_000),
    );
    expect(await store.findValid(tokenHash, new Date(now.getTime() + 120_000))).not.toBeNull();

    await store.delete(tokenHash);
    expect(await store.findValid(tokenHash, now)).toBeNull();
  });

  it('findet die laufende Season mit veröffentlichter Konfiguration', async () => {
    const current = await new DrizzleSeasonRepository(conn.db).findCurrent();
    expect(current).toMatchObject({ isTest: true, configVersion: 1 });
    expect(current!.game.maxLevel).toBe(DEFAULT_GAME_CONFIG.maxLevel);
  });

  it('speichert Charakter, Punkte und Loadouts je Klasse', async () => {
    const seasonId = (await new DrizzleSeasonRepository(conn.db).findCurrent())!.id;
    const [acc] = await conn.db.insert(account).values({}).returning();
    const [other] = await conn.db.insert(account).values({}).returning();
    const repo = new DrizzleCharacterRepository(conn.db);
    const name = `Kira${Date.now() % 100000}`;

    const created = await repo.create({
      accountId: acc!.id,
      seasonId,
      name,
      classId: 'bruiser',
      level: 1,
      xp: 0,
      allocated: { str: 0, dex: 0, int: 0, con: 0 },
      loadouts: { bruiser: defaultLoadout(DEFAULT_GAME_CONFIG, 'bruiser', 1) },
    });
    await expect(
      repo.create({ ...created, accountId: other!.id, name: name.toUpperCase() }),
    ).rejects.toBeInstanceOf(NameTakenError);
    await expect(repo.create({ ...created, name: `${name}x` })).rejects.toBeInstanceOf(
      CharacterExistsError,
    );
    expect(await repo.isNameTaken(seasonId, name.toLowerCase())).toBe(true);

    const gunnerLoadout = { abilities: ['gunner.double_tap'], tactics: [] };
    await repo.save({
      ...created,
      classId: 'gunner',
      allocated: { str: 0, dex: 3, int: 0, con: 2 },
      loadouts: { ...created.loadouts, gunner: gunnerLoadout },
    });
    const loaded = await repo.findForAccount(acc!.id, seasonId);
    expect(loaded).toMatchObject({ classId: 'gunner', allocated: { dex: 3, con: 2 } });
    expect(loaded!.loadouts.gunner).toEqual(gunnerLoadout);
    expect(loaded!.loadouts.bruiser?.abilities).toEqual([
      'bruiser.heavy_strike',
      'bruiser.provoke',
    ]);
  });

  it('speichert Kämpfe komprimiert, zählt Belohnungen und sperrt parallele Kämpfe', async () => {
    const current = (await new DrizzleSeasonRepository(conn.db).findCurrent())!;
    const chars = new DrizzleCharacterRepository(conn.db);
    const make = async (name: string) => {
      const [acc] = await conn.db.insert(account).values({}).returning();
      return chars.create({
        accountId: acc!.id,
        seasonId: current.id,
        name: `${name}${Date.now() % 100000}`,
        classId: 'gunner',
        level: 1,
        xp: 0,
        allocated: { str: 0, dex: 0, int: 0, con: 0 },
        loadouts: { gunner: defaultLoadout(DEFAULT_GAME_CONFIG, 'gunner', 1) },
      });
    };
    const a = await make('A');
    const b = await make('B');
    const snap = (c: typeof a) =>
      deriveSnapshot(DEFAULT_GAME_CONFIG, { ...c, loadout: c.loadouts.gunner! });
    const teams = [[snap(a)], [snap(b)]];
    const result = simulateBattle({
      engineVersion: ENGINE_VERSION,
      configVersion: 1,
      seed: 's',
      teams,
    });

    const repo = new DrizzleFightRepository(conn.db);
    const record = (rewarded: boolean) =>
      repo.locked(a.id, async (tx) => {
        const id = await tx.insert({
          seasonId: current.id,
          kind: 'pvp_rated',
          seed: 's',
          configVersion: 1,
          input: { teams },
          result,
          rewardDay: '2026-11-12',
          participants: [
            {
              team: 0,
              slot: 0,
              characterId: a.id,
              initiator: true,
              won: true,
              rewarded,
              xpAwarded: 60,
              creditsAwarded: 0,
              opponentCharacterId: b.id,
            },
            {
              team: 1,
              slot: 0,
              characterId: b.id,
              initiator: false,
              won: false,
              rewarded: false,
              xpAwarded: 0,
              creditsAwarded: 0,
              opponentCharacterId: a.id,
            },
          ],
        });
        await tx.setProgress(a.id, 60, 1);
        return id;
      });
    const ids = await Promise.all([record(true), record(true), record(false)]);

    const counts = await repo.rewardCounts(a.id, '2026-11-12');
    expect(counts.today).toBe(2);
    expect(counts.byOpponent.get(b.id)).toBe(2);
    expect((await repo.rewardCounts(a.id, '2026-11-13')).today).toBe(0);

    const stored = await repo.findById(ids[0]!);
    expect(stored!.result.events).toEqual(result.events);
    expect(stored!.participants).toHaveLength(2);
    expect(await repo.listForCharacter(b.id, 10)).toHaveLength(3);
    expect((await chars.findById(a.id))!.xp).toBe(60);
  });

  it('speichert Items und Ausrüstung und liefert sie mit dem Charakter', async () => {
    const current = (await new DrizzleSeasonRepository(conn.db).findCurrent())!;
    const chars = new DrizzleCharacterRepository(conn.db);
    const [acc] = await conn.db.insert(account).values({}).returning();
    const c = await chars.create({
      accountId: acc!.id,
      seasonId: current.id,
      name: `Gear${Date.now() % 100000}`,
      classId: 'gunner',
      level: 1,
      xp: 0,
      allocated: { str: 0, dex: 0, int: 0, con: 0 },
      loadouts: {},
    });
    const inv = new DrizzleInventoryRepository(conn.db);
    const pistol = rollItem(DEFAULT_GAME_CONFIG, {
      templateId: 'pistol',
      itemLevel: 3,
      rarity: 5,
      seed: 1,
    });
    const rifle = rollItem(DEFAULT_GAME_CONFIG, {
      templateId: 'rifle',
      itemLevel: 3,
      rarity: 2,
      seed: 2,
    });
    const [p, r] = await inv.addItems(acc!.id, current.id, [
      { data: pistol, source: 'test' },
      { data: rifle, source: 'test' },
    ]);
    expect(await inv.countItems(acc!.id, current.id)).toBe(2);

    await inv.setEquipment(c.id, { main_hand: p! });
    await inv.setEquipment(c.id, { off_hand: p!, main_hand: r! }); // Item wechselt den Platz
    expect(await inv.equipmentOf(c.id)).toEqual({ off_hand: p, main_hand: r });
    await inv.setEquipment(c.id, { off_hand: null });
    expect((await chars.findById(c.id))!.equipment).toEqual({ main_hand: rifle });
  });
});
