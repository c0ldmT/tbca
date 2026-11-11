/**
 * Integrationstest gegen eine echte PostgreSQL-Datenbank.
 * Läuft nur, wenn TBCA_TEST_DATABASE_URL gesetzt ist; die Datenbank wird dabei geleert.
 *
 *   TBCA_TEST_DATABASE_URL=postgres://tbca:…@localhost:55432/tbca_test pnpm --filter @tbca/db test
 */
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  account,
  character,
  community,
  communityMember,
  configVersion,
  createDb,
  DEV_SEASON_SLUG,
  identity,
  pingDb,
  runMigrations,
  season,
  seedDevelopment,
  type DbConnection,
} from '../src/index.js';

const url = process.env['TBCA_TEST_DATABASE_URL'];

describe.skipIf(!url)('Datenbank (Integration)', () => {
  let conn: DbConnection;

  beforeAll(async () => {
    conn = createDb(url!, { maxConnections: 2, applicationName: 'tbca-test' });
    await conn.db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await conn.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await conn.db.execute(sql`CREATE SCHEMA public`);
    await runMigrations(conn.db);
    await seedDevelopment(conn.db);
  });

  afterAll(async () => {
    await conn?.close();
  });

  it('ist erreichbar und vollständig migriert', async () => {
    await expect(pingDb(conn.pool)).resolves.toBeUndefined();
    await expect(runMigrations(conn.db)).resolves.toBeUndefined(); // idempotent
  });

  it('spielt den Seed idempotent ein', async () => {
    await seedDevelopment(conn.db);
    const seasons = await conn.db.select().from(season).where(eq(season.slug, DEV_SEASON_SLUG));
    expect(seasons).toHaveLength(1);
    const configs = await conn.db
      .select()
      .from(configVersion)
      .where(eq(configVersion.seasonId, seasons[0]!.id));
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({ status: 'published', version: 1 });
    expect(configs[0]!.data.battle.actionThreshold).toBe(1000);
  });

  it('ordnet Identitäten eindeutig über Anbieter und Plattform-ID zu', async () => {
    const [a] = await conn.db.insert(account).values({}).returning();
    const [b] = await conn.db.insert(account).values({}).returning();
    expect(a!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a!.id < b!.id).toBe(true); // UUIDv7 ist zeitlich sortierbar

    await conn.db
      .insert(identity)
      .values({ accountId: a!.id, provider: 'discord', providerUserId: '42', displayName: 'Neo' });
    await expect(
      conn.db
        .insert(identity)
        .values({ accountId: b!.id, provider: 'discord', providerUserId: '42', displayName: 'X' }),
    ).rejects.toThrow();
    // Gleiche ID auf einer anderen Plattform ist erlaubt.
    await conn.db
      .insert(identity)
      .values({ accountId: b!.id, provider: 'twitch', providerUserId: '42', displayName: 'Neo' });
  });

  it('erzwingt eindeutige Charakternamen pro Season ohne Groß-/Kleinschreibung', async () => {
    const [devSeason] = await conn.db.select().from(season).where(eq(season.slug, DEV_SEASON_SLUG));
    const [a] = await conn.db.insert(account).values({}).returning();
    const [b] = await conn.db.insert(account).values({}).returning();

    await conn.db
      .insert(character)
      .values({ accountId: a!.id, seasonId: devSeason!.id, name: 'Glitch' });
    await expect(
      conn.db
        .insert(character)
        .values({ accountId: b!.id, seasonId: devSeason!.id, name: 'gLiTcH' }),
    ).rejects.toThrow();
    await expect(
      conn.db
        .insert(character)
        .values({ accountId: a!.id, seasonId: devSeason!.id, name: 'Zweiter' }),
    ).rejects.toThrow(); // ein Charakter pro Account und Season
    await expect(
      conn.db.insert(character).values({ accountId: b!.id, seasonId: devSeason!.id, name: 'ab' }),
    ).rejects.toThrow(); // mindestens 3 Zeichen
  });

  it('erlaubt genau eine Heimat-Community pro Account', async () => {
    const [acc] = await conn.db.insert(account).values({}).returning();
    const [c1] = await conn.db.insert(community).values({ slug: 'c1', name: 'Eins' }).returning();
    const [c2] = await conn.db.insert(community).values({ slug: 'c2', name: 'Zwei' }).returning();

    await conn.db
      .insert(communityMember)
      .values({ communityId: c1!.id, accountId: acc!.id, isHome: true });
    await expect(
      conn.db
        .insert(communityMember)
        .values({ communityId: c2!.id, accountId: acc!.id, isHome: true }),
    ).rejects.toThrow();
    await conn.db.insert(communityMember).values({ communityId: c2!.id, accountId: acc!.id });

    const memberships = await conn.db
      .select()
      .from(communityMember)
      .where(and(eq(communityMember.accountId, acc!.id)));
    expect(memberships).toHaveLength(2);
  });

  it('löscht beim Löschen eines Accounts Identitäten und Mitgliedschaften mit', async () => {
    const [acc] = await conn.db.insert(account).values({}).returning();
    await conn.db.insert(identity).values({
      accountId: acc!.id,
      provider: 'discord',
      providerUserId: 'gone',
      displayName: 'Gone',
    });
    await conn.db.delete(account).where(eq(account.id, acc!.id));
    const left = await conn.db.select().from(identity).where(eq(identity.providerUserId, 'gone'));
    expect(left).toHaveLength(0);
  });
});
