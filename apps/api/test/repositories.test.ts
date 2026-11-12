/**
 * Drizzle-Repositories gegen eine echte PostgreSQL-Datenbank.
 * Läuft nur mit TBCA_TEST_DATABASE_URL (siehe packages/db/README.md).
 */
import { randomUUID } from 'node:crypto';

import {
  account,
  creditBalance,
  season,
  createDb,
  InsufficientMaterialsError,
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
import { DrizzleEconomyRepository } from '../src/economy/drizzle-economy.repository.js';
import { AlreadyPurchasedError, ItemEquippedError } from '../src/economy/types.js';
import { DrizzleSeasonRepository } from '../src/game/season.js';
import { DrizzleDiscordRepository } from '../src/discord/drizzle-discord.repository.js';
import { DrizzleTeamRepository } from '../src/team/drizzle-team.repository.js';
import { DrizzleAccountDataRepository } from '../src/account/drizzle-account-data.repository.js';
import { TeamConflictError } from '../src/team/types.js';
import { DrizzleSeasonAdminRepository } from '../src/admin/drizzle-season-admin.repository.js';
import { DrizzleExportRepository } from '../src/admin/drizzle-export.repository.js';
import { DrizzleDungeonRepository } from '../src/dungeon/drizzle-dungeon.repository.js';

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
    expect(await repo.levels(seasonId)).toContain(1);

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

  it('bucht Credits, Materialien und Items gemeinsam oder gar nicht', async () => {
    const current = (await new DrizzleSeasonRepository(conn.db).findCurrent())!;
    const seasonId = current.id;
    const [acc] = await conn.db.insert(account).values({}).returning();
    const accountId = acc!.id;
    const chars = new DrizzleCharacterRepository(conn.db);
    const c = await chars.create({
      accountId,
      seasonId,
      name: `Eco${Date.now() % 100000}`,
      classId: 'gunner',
      level: 1,
      xp: 0,
      allocated: { str: 0, dex: 0, int: 0, con: 0 },
      loadouts: {},
    });
    const eco = new DrizzleEconomyRepository(conn.db);
    const inv = new DrizzleInventoryRepository(conn.db);
    const data = rollItem(DEFAULT_GAME_CONFIG, {
      templateId: 'vest',
      itemLevel: 5,
      rarity: 4,
      seed: 9,
    });

    const { addedIds } = await eco.commit({
      seasonId,
      accountId,
      credits: { amount: 100, kind: 'test', system: 'source:admin' },
      stacks: { scrap: 3 },
      addItems: [{ data, source: 'test' }],
    });
    expect(await eco.stacks(accountId, seasonId)).toEqual({ scrap: 3 });

    // Zu wenig Material: auch die Credits bleiben unangetastet.
    await expect(
      eco.commit({
        seasonId,
        accountId,
        credits: { amount: -50, kind: 'upgrade', system: 'sink:crafting' },
        stacks: { scrap: -5 },
      }),
    ).rejects.toBeInstanceOf(InsufficientMaterialsError);
    expect(await creditBalance(conn.db, seasonId, accountId)).toBe(100);

    await inv.setEquipment(c.id, { torso: addedIds[0]! });
    await expect(
      eco.commit({ seasonId, accountId, deleteItems: [addedIds[0]!] }),
    ).rejects.toBeInstanceOf(ItemEquippedError);
    await inv.setEquipment(c.id, { torso: null });
    await eco.commit({ seasonId, accountId, deleteItems: [addedIds[0]!], stacks: { scrap: 1 } });
    expect(await inv.countItems(accountId, seasonId)).toBe(0);

    await eco.commit({
      seasonId,
      accountId,
      purchase: { day: '2026-11-16', offerId: 'rotation-0' },
    });
    await expect(
      eco.commit({ seasonId, accountId, purchase: { day: '2026-11-16', offerId: 'rotation-0' } }),
    ).rejects.toBeInstanceOf(AlreadyPurchasedError);
    expect(await eco.purchases(accountId, seasonId, '2026-11-16')).toEqual(['rotation-0']);
  });

  it('verwaltet Discord-Communities, Mitgliedschaften und passive Tages-XP', async () => {
    const repo = new DrizzleDiscordRepository(conn.db);
    const guildId = String(Date.now());
    const guild = await repo.ensureGuildCommunity(guildId, 'Night City');
    expect(await repo.ensureGuildCommunity(guildId, 'Night City')).toEqual(guild);
    await repo.setChannelXp(guildId, '777', true);
    await repo.setChannelXp(guildId, '778', true);
    await repo.setChannelXp(guildId, '778', false);
    expect((await repo.communityForGuild(guildId))!.xpChannels).toEqual(['777']);

    const current = (await new DrizzleSeasonRepository(conn.db).findCurrent())!;
    const [acc] = await conn.db.insert(account).values({}).returning();
    await repo.ensureMember(guild.communityId, acc!.id);
    await repo.ensureMember(guild.communityId, acc!.id);
    const chars = new DrizzleCharacterRepository(conn.db);
    const c = await chars.create({
      accountId: acc!.id,
      seasonId: current.id,
      name: `Chat${Date.now() % 100000}`,
      classId: 'gunner',
      level: 1,
      xp: 0,
      allocated: { str: 0, dex: 0, int: 0, con: 0 },
      loadouts: {},
    });
    const input = {
      seasonId: current.id,
      accountId: acc!.id,
      characterId: c.id,
      day: '2026-11-19',
    };
    const first = await repo.bookPassive(input, (s) => ({
      rawToday: s.rawToday + 20,
      awarded: 20,
      xp: s.xp + 20,
      level: s.level,
    }));
    expect(first).toEqual({ awarded: 20, level: 1, levelBefore: 1 });
    await repo.bookPassive(input, (s) => {
      expect(s).toEqual({ rawToday: 20, xp: 20, level: 1 });
      return { rawToday: 200, awarded: 120, xp: 140, level: 2 };
    });
    expect((await chars.findById(c.id))!.xp).toBe(140);
    // Rohstand lesen und gebündelte Nachrichten zählen
    expect(await repo.passiveRaw(input)).toBe(200);
    await repo.bookPassive({ ...input, messages: 3 }, (s) => ({ ...s, awarded: 0 }));
    expect(await repo.passiveRaw({ ...input, day: '2026-11-20' })).toBe(0);
  });

  it('verwaltet Teams mit eindeutigen Namen und einem Team je Community', async () => {
    const repo = new DrizzleTeamRepository(conn.db);
    const guild = await new DrizzleDiscordRepository(conn.db).ensureGuildCommunity(
      `${Date.now()}9`,
      'Teamtest',
    );
    const [a] = await conn.db.insert(account).values({}).returning();
    const [b] = await conn.db.insert(account).values({}).returning();
    await repo.joinCommunity(guild.communityId, a!.id);
    await repo.joinCommunity(guild.communityId, b!.id);
    expect(await repo.isCommunityMember(guild.communityId, a!.id)).toBe(true);

    const suffix = String(Date.now() % 100000);
    const t1 = await repo.create({
      communityId: guild.communityId,
      name: `Wolves${suffix}`,
      tag: `W${suffix.slice(-3)}`,
      logo: 'wolf',
      captainAccountId: a!.id,
      joinCode: `J${suffix}`,
      focus: 'threat',
      lineup2: [],
      lineup3: [],
    });
    expect(t1).toMatchObject({ members: [a!.id], communityName: 'Teamtest' });
    await expect(
      repo.create({
        communityId: guild.communityId,
        name: `wolves${suffix}`,
        tag: 'ZZZ',
        logo: 'eye',
        captainAccountId: b!.id,
        joinCode: `K${suffix}`,
        focus: 'threat',
        lineup2: [],
        lineup3: [],
      }),
    ).rejects.toEqual(new TeamConflictError('team_name_taken'));
    await repo.addMember(t1, b!.id);
    await expect(repo.addMember(t1, b!.id)).rejects.toBeInstanceOf(TeamConflictError);
    await repo.update(t1.id, { focus: 'healer', lineup2: [a!.id, b!.id] });
    expect(await repo.findByCode(`j${suffix}`)).toMatchObject({
      focus: 'healer',
      members: [a!.id, b!.id],
    });
    expect((await repo.search(`wolves${suffix}`, 5)).map((t) => t.id)).toEqual([t1.id]);
    await repo.removeMember(t1.id, b!.id);
    await repo.remove(t1.id);
    expect(await repo.find(t1.id)).toBeNull();
  });

  it('exportiert und löscht Konten vollständig, Replays anderer bleiben anonymisiert', async () => {
    const current = (await new DrizzleSeasonRepository(conn.db).findCurrent())!;
    const chars = new DrizzleCharacterRepository(conn.db);
    const [a] = await conn.db.insert(account).values({}).returning();
    const [b] = await conn.db.insert(account).values({}).returning();
    const suffix = String(Date.now() % 100000);
    const mk = (acc: string, name: string) =>
      chars.create({
        accountId: acc,
        seasonId: current.id,
        name,
        classId: 'gunner',
        level: 1,
        xp: 0,
        allocated: { str: 0, dex: 0, int: 0, con: 0 },
        loadouts: { gunner: defaultLoadout(DEFAULT_GAME_CONFIG, 'gunner', 1) },
      });
    const ca = await mk(a!.id, `Del${suffix}`);
    const cb = await mk(b!.id, `Keep${suffix}`);
    const snap = (c: typeof ca) =>
      deriveSnapshot(DEFAULT_GAME_CONFIG, {
        id: c.id,
        name: c.name,
        level: 1,
        classId: 'gunner',
        allocated: c.allocated,
        loadout: defaultLoadout(DEFAULT_GAME_CONFIG, 'gunner', 1),
      });
    const teams = [[snap(ca)], [snap(cb)]];
    const result = simulateBattle({
      engineVersion: ENGINE_VERSION,
      configVersion: 1,
      seed: 'del',
      teams,
    });
    const fights = new DrizzleFightRepository(conn.db);
    const fightId = await fights.locked(ca.id, (tx) =>
      tx.insert({
        seasonId: current.id,
        kind: 'pvp_friendly',
        seed: 'del',
        configVersion: 1,
        input: { teams },
        result,
        rewardDay: '2026-11-24',
        participants: [
          {
            team: 0,
            slot: 0,
            characterId: ca.id,
            initiator: true,
            won: result.winner === 0,
            rewarded: false,
            xpAwarded: 0,
            creditsAwarded: 0,
            opponentCharacterId: cb.id,
          },
          {
            team: 1,
            slot: 0,
            characterId: cb.id,
            initiator: false,
            won: result.winner === 1,
            rewarded: false,
            xpAwarded: 0,
            creditsAwarded: 0,
            opponentCharacterId: ca.id,
          },
        ],
      }),
    );

    const repo = new DrizzleAccountDataRepository(conn.db);
    const data = await repo.export(a!.id);
    expect((data['characters'] as { name: string }[])[0]!.name).toBe(`Del${suffix}`);
    expect((data['fights'] as unknown[]).length).toBe(1);

    await repo.delete(a!.id, 'Gelöschter Spieler');
    expect(await chars.findById(ca.id)).toBeNull();
    const stored = (await fights.findById(fightId))!;
    expect(
      stored.input.teams
        .flat()
        .map((c) => c.name)
        .sort(),
    ).toEqual(['Gelöschter Spieler', `Keep${suffix}`]);
    expect((await conn.db.select().from(account).where(eq(account.id, a!.id))).length).toBe(0);
  });
  it('setzt Tageslimits zurück und die Season auf Anfang', async () => {
    // Eigene Season, damit das Zurücksetzen die anderen Tests nicht berührt
    const [own] = await conn.db
      .insert(season)
      .values({
        slug: `reset-${Date.now()}`,
        name: 'Reset-Test',
        isTest: true,
        startsAt: new Date('2026-11-01T00:00:00Z'),
        endsAt: new Date('2027-01-01T00:00:00Z'),
      })
      .returning();
    const seasonId = own!.id;
    const chars = new DrizzleCharacterRepository(conn.db);
    const make = async (name: string, isBot = false) => {
      const [acc] = await conn.db.insert(account).values({ isBot }).returning();
      return chars.create({
        accountId: acc!.id,
        seasonId,
        name: `${name}${Date.now() % 100000}`,
        classId: 'gunner',
        level: 5,
        xp: 900,
        allocated: { str: 0, dex: 10, int: 0, con: 10 },
        loadouts: { gunner: defaultLoadout(DEFAULT_GAME_CONFIG, 'gunner', 5) },
      });
    };
    const a = await make('Ra');
    const b = await make('Rb');
    const bot = await make('Rbot', true);
    const snap = (c: typeof a) =>
      deriveSnapshot(DEFAULT_GAME_CONFIG, { ...c, loadout: c.loadouts.gunner! });
    const teams = [[snap(a)], [snap(b)]];
    const result = simulateBattle({
      engineVersion: ENGINE_VERSION,
      configVersion: 1,
      seed: 'r',
      teams,
    });
    const fights = new DrizzleFightRepository(conn.db);
    const fightOnce = () =>
      fights.locked(a.id, (tx) =>
        tx.insert({
          seasonId,
          kind: 'pvp_rated',
          seed: 'r',
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
              rewarded: true,
              xpAwarded: 60,
              creditsAwarded: 0,
              opponentCharacterId: b.id,
            },
          ],
        }),
      );
    const dungeon = new DrizzleDungeonRepository(conn.db);
    const runOnce = (characterId: string, accountId: string) =>
      dungeon.locked(characterId, (tx) =>
        tx.saveRun({
          id: null,
          seasonId,
          accountId,
          characterId,
          status: 'left',
          floor: 2,
          seed: 'x',
          snapshot: snap(a),
          hp: 1,
          energy: 1,
          injectors: 0,
          backupChip: false,
          loot: { items: [], credits: 0 },
          xpGained: 0,
          lastFightId: null,
          rewardDay: '2026-11-12',
          lastActionAt: new Date(),
          endedAt: new Date(),
        }),
      );
    await fightOnce();
    await runOnce(a.id, a.accountId);
    await runOnce(b.id, b.accountId);
    const runsOf = (id: string) => dungeon.locked(id, (tx) => tx.runsOnDay(id, '2026-11-12'));

    const repo = new DrizzleSeasonAdminRepository(conn.db);
    expect(await repo.info(seasonId)).toMatchObject({ slug: own!.slug });
    expect(await repo.stats(seasonId, '2026-11-12')).toMatchObject({
      characters: 2,
      bots: 1,
      playedToday: 2,
      dungeonRunsToday: 2,
      rewardedFightsToday: 1,
    });

    // Nur Spieler a: Dungeon zurück, Kämpfe bleiben
    await repo.resetDaily({
      seasonId,
      day: '2026-11-12',
      kinds: ['dungeon'],
      account: { accountId: a.accountId, characterId: a.id },
    });
    expect(await runsOf(a.id)).toBe(0);
    expect(await runsOf(b.id)).toBe(1);
    expect((await fights.rewardCounts(a.id, '2026-11-12')).today).toBe(1);

    // Alle: Kämpfe zurück; danach zählen neue Kämpfe wieder
    await repo.resetDaily({ seasonId, day: '2026-11-12', kinds: ['fights'], account: null });
    expect((await fights.rewardCounts(a.id, '2026-11-12')).today).toBe(0);
    await fightOnce();
    expect((await fights.rewardCounts(a.id, '2026-11-12')).today).toBe(1);
    expect((await repo.resetsOn(seasonId, '2026-11-12')).map((r) => r.kind)).toEqual([
      'fights',
      'dungeon',
    ]);

    const progress = await repo.resetSeason(seasonId, 'progress');
    expect(progress).toMatchObject({ characters: 3, fights: 2, runs: 2 });
    expect(await chars.findById(a.id)).toMatchObject({ level: 1, xp: 0, allocated: { dex: 0 } });

    const wiped = await repo.resetSeason(seasonId, 'wipe');
    expect(wiped.characters).toBe(3);
    expect(await chars.findById(a.id)).toBeNull();
    expect(await chars.findById(bot.id)).toMatchObject({ level: 1 });

    await repo.setEnd(seasonId, new Date('2027-02-01T00:00:00Z'));
    expect((await repo.info(seasonId))!.endsAt.toISOString()).toBe('2027-02-01T00:00:00.000Z');
  });
  it('liefert die Rohdaten für den Balancing-Export', async () => {
    const current = (await new DrizzleSeasonRepository(conn.db).findCurrent())!;
    const rows = await new DrizzleExportRepository(conn.db).rows(current.id, new Date(0), 50);
    // Die vorigen Tests haben Charaktere und Kämpfe in der Dev-Season angelegt
    expect(rows.characters.length).toBeGreaterThan(0);
    expect(rows.characters[0]).toHaveProperty('allocated');
    expect(rows.fights.length).toBeGreaterThan(0);
    expect(rows.fights[0]!.teams.length).toBe(2);
    expect(rows.fights[0]!.participants.length).toBeGreaterThan(0);
    for (const list of [rows.runs, rows.credits, rows.items, rows.purchases, rows.passive])
      expect(Array.isArray(list)).toBe(true);
  });
});
