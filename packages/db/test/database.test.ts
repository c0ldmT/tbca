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
  creditBalance,
  creditEntry,
  InsufficientCreditsError,
  transferCredits,
  configVersion,
  createDb,
  DEV_SEASON_SLUG,
  identity,
  pingDb,
  runMigrations,
  season,
  seedDevelopment,
  teamMember,
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

    // Bot-Gegner: jede Klasse auf jeder Bot-Stufe, nur einmal angelegt.
    const bots = await conn.db
      .select({ name: character.name, level: character.level, isBot: account.isBot })
      .from(character)
      .innerJoin(account, eq(account.id, character.accountId))
      .where(eq(character.seasonId, seasons[0]!.id));
    expect(bots.filter((b) => b.isBot)).toHaveLength(16);
    expect(new Set(bots.map((b) => b.level))).toEqual(new Set([1, 3, 6, 10]));

    // Vier Bot-Teams mit je vier verschiedenen Bots
    const members = await conn.db
      .select({ teamId: teamMember.teamId, accountId: teamMember.accountId })
      .from(teamMember);
    expect(new Set(members.map((m) => m.teamId)).size).toBe(4);
    expect(members).toHaveLength(16);
    expect(new Set(members.map((m) => m.accountId)).size).toBe(16);
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

  it('bucht Credits doppelt, hält den Saldo nicht negativ und rollt Fehler zurück', async () => {
    const [devSeason] = await conn.db.select().from(season).where(eq(season.slug, DEV_SEASON_SLUG));
    const [acc] = await conn.db.insert(account).values({}).returning();
    const seasonId = devSeason!.id;

    const txId = await conn.db.transaction((tx) =>
      transferCredits(tx, {
        seasonId,
        kind: 'pvp_reward',
        lines: [
          { accountId: acc!.id, amount: 50 },
          { system: 'source:pvp', amount: -50 },
        ],
      }),
    );
    expect(await creditBalance(conn.db, seasonId, acc!.id)).toBe(50);
    const entries = await conn.db
      .select()
      .from(creditEntry)
      .where(eq(creditEntry.transactionId, txId));
    expect(entries.reduce((sum, e) => sum + e.amount, 0)).toBe(0);

    const spend = (amount: number) =>
      conn.db.transaction((tx) =>
        transferCredits(tx, {
          seasonId,
          kind: 'respec',
          lines: [
            { accountId: acc!.id, amount: -amount },
            { system: 'sink:respec', amount },
          ],
        }),
      );
    await expect(spend(80)).rejects.toBeInstanceOf(InsufficientCreditsError);
    await spend(30);
    expect(await creditBalance(conn.db, seasonId, acc!.id)).toBe(20);

    await expect(
      conn.db.transaction((tx) =>
        transferCredits(tx, {
          seasonId,
          kind: 'broken',
          lines: [{ accountId: acc!.id, amount: 5 }],
        }),
      ),
    ).rejects.toThrow(RangeError);
    expect(await creditBalance(conn.db, seasonId, acc!.id)).toBe(20);
  });
});
