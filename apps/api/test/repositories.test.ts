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
import { DEFAULT_GAME_CONFIG, defaultLoadout } from '@tbca/game-core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAccountRepository, DrizzleSessionStore } from '../src/auth/drizzle-repositories.js';
import { DrizzleCharacterRepository } from '../src/character/drizzle-character.repository.js';
import { CharacterExistsError, NameTakenError } from '../src/character/types.js';
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
});
