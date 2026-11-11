/**
 * Drizzle-Repositories gegen eine echte PostgreSQL-Datenbank.
 * Läuft nur mit TBCA_TEST_DATABASE_URL (siehe packages/db/README.md).
 */
import { randomUUID } from 'node:crypto';

import { account, createDb, identity, runMigrations, type DbConnection } from '@tbca/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAccountRepository, DrizzleSessionStore } from '../src/auth/drizzle-repositories.js';

const url = process.env['TBCA_TEST_DATABASE_URL'];

describe.skipIf(!url)('Drizzle-Repositories (Integration)', () => {
  let conn: DbConnection;

  beforeAll(async () => {
    conn = createDb(url!, { maxConnections: 4, applicationName: 'tbca-api-test' });
    await runMigrations(conn.db);
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
});
