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
  InsufficientCreditsError,
  InsufficientMaterialsError,
  identity,
  runMigrations,
  seedDevelopment,
  transferCredits,
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
import { DrizzlePvpRepository } from '../src/fight/drizzle-pvp.repository.js';
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
import { DrizzleLeagueRepository } from '../src/league/drizzle-league.repository.js';
import { DrizzleTeamLeagueRepository } from '../src/league/drizzle-team-league.repository.js';

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
  it('speichert Ratings, Liga-Zyklen, Paarungen und Abschluss', async () => {
    const [own] = await conn.db
      .insert(season)
      .values({
        slug: `league-${Date.now()}`,
        name: 'Liga-Test',
        isTest: true,
        startsAt: new Date('2026-11-01T00:00:00Z'),
        endsAt: new Date('2027-01-01T00:00:00Z'),
      })
      .returning();
    const seasonId = own!.id;
    const chars = new DrizzleCharacterRepository(conn.db);
    const make = async (name: string) => {
      const [acc] = await conn.db.insert(account).values({}).returning();
      return chars.create({
        accountId: acc!.id,
        seasonId,
        name: `${name}${Date.now() % 100000}`,
        classId: 'gunner',
        level: 3,
        xp: 0,
        allocated: { str: 0, dex: 3, int: 0, con: 3 },
        loadouts: {},
      });
    };
    const [a, b, c] = [await make('La'), await make('Lb'), await make('Lc')];
    const repo = new DrizzleLeagueRepository(conn.db);

    // Ratings: fehlende werden mit Startwerten angelegt und gesperrt fortgeschrieben
    const updated = await repo.updateRatings(seasonId, [a.id, b.id], (cur) =>
      [...cur.values()].map((r) => ({
        ...r,
        rating: r.rating + (r.characterId === a.id ? 50 : -50),
        games: r.games + 5,
      })),
    );
    expect(updated).toHaveLength(2);
    expect((await repo.ratings([a.id, b.id, c.id])).get(a.id)).toMatchObject({
      rating: 1550,
      games: 5,
    });
    expect(await repo.setJoined(seasonId, a.id, true)).toMatchObject({
      leagueJoined: true,
      games: 5,
    });
    await repo.setJoined(seasonId, b.id, true);
    await repo.setJoined(seasonId, c.id, true);
    expect((await repo.entrants(seasonId, 5)).map((r) => r.characterId)).toEqual([a.id, b.id]);
    const board = await repo.leaderboard(seasonId, { minGames: 5, limit: 10, homeOfAccount: null });
    expect(board.map((r) => r.characterId)).toEqual([a.id, b.id]);
    expect(board[0]).toMatchObject({ classId: 'gunner', isBot: false });
    // Ohne Heimat-Community bleibt die Community-Rangliste leer
    expect(
      await repo.leaderboard(seasonId, { minGames: 5, limit: 10, homeOfAccount: a.accountId }),
    ).toEqual([]);

    // Zyklus mit zwei Spieltagen
    const day = (h: number) => new Date(Date.UTC(2026, 10, 12, h));
    const cycle = await repo.createCycle({
      seasonId,
      number: 1,
      startsAt: day(19),
      endsAt: day(43),
      members: [a, b, c].map((x, i) => ({
        characterId: x.id,
        division: 0,
        ratingAtStart: 1500 - i,
      })),
      matches: [
        {
          division: 0,
          matchday: 1,
          lockAt: day(18),
          playAt: day(19),
          aCharacterId: a.id,
          bCharacterId: b.id,
          status: 'scheduled',
        },
        {
          division: 0,
          matchday: 1,
          lockAt: day(18),
          playAt: day(19),
          aCharacterId: c.id,
          bCharacterId: null,
          status: 'bye',
        },
        {
          division: 0,
          matchday: 2,
          lockAt: day(42),
          playAt: day(43),
          aCharacterId: b.id,
          bCharacterId: c.id,
          status: 'scheduled',
        },
      ],
    });
    expect(await repo.activeCycle(seasonId)).toMatchObject({ id: cycle.id, number: 1 });
    await expect(
      repo.createCycle({
        seasonId,
        number: 1,
        startsAt: day(1),
        endsAt: day(2),
        members: [],
        matches: [],
      }),
    ).rejects.toThrow();
    expect(await repo.nextEvent(cycle.id)).toEqual({ kind: 'lock', at: day(18) });
    const [first] = await repo.matches(cycle.id);
    await repo.lockMatches([{ id: first!.id, snapshots: [] }]);
    expect(await repo.nextEvent(cycle.id)).toEqual({ kind: 'play', at: day(19) });
    await repo.finishMatch(first!.id, { fightId: null, winnerCharacterId: a.id, draw: false });
    // Ein zweites Abschließen ändert nichts mehr
    await repo.finishMatch(first!.id, { fightId: null, winnerCharacterId: b.id, draw: false });
    expect((await repo.matches(cycle.id))[0]).toMatchObject({
      status: 'played',
      winnerCharacterId: a.id,
    });
    expect(await repo.nextEvent(cycle.id)).toEqual({ kind: 'lock', at: day(42) });

    await repo.finishCycle(cycle.id, day(43), [
      { characterId: a.id, place: 1, movement: 'stay' },
      { characterId: b.id, place: 2, movement: 'stay' },
      { characterId: c.id, place: 3, movement: 'stay' },
    ]);
    expect(await repo.activeCycle(seasonId)).toBeNull();
    expect(await repo.lastCycle(seasonId)).toMatchObject({
      status: 'finished',
      finishedAt: day(43),
    });
    expect((await repo.members(cycle.id)).map((m) => m.place)).toEqual([1, 2, 3]);
    expect(await repo.memberships(a.id, 5)).toHaveLength(1);

    // Season zurücksetzen löscht Liga und Ratings
    await new DrizzleSeasonAdminRepository(conn.db).resetSeason(seasonId, 'progress');
    expect(await repo.lastCycle(seasonId)).toBeNull();
    expect((await repo.ratings([a.id])).size).toBe(0);
  });

  it('verwaltet Liga-Kanäle und findet Heimat-Mitglieder', async () => {
    const discord = new DrizzleDiscordRepository(conn.db);
    const guildId = `9${Date.now()}`.slice(0, 18);
    const guild = await discord.ensureGuildCommunity(guildId, 'Liga-Server');
    const [first, second] = [`8${Date.now()}1`.slice(0, 18), `8${Date.now()}2`.slice(0, 19)];
    const t0 = new Date('2026-11-12T10:00:00Z');
    await discord.setLeagueChannel(guildId, first, true, t0);
    await discord.setLeagueChannel(guildId, second, true, t0);
    // Nur ein Liga-Kanal je Server
    const mine = (await discord.leagueChannels()).filter((c) => c.guildId === guildId);
    expect(mine).toEqual([
      { guildId, channelId: second, communityId: guild.communityId, announcedUntil: t0 },
    ]);
    const t1 = new Date('2026-11-12T20:00:00Z');
    await discord.markLeagueAnnounced(second, t1);
    expect(
      (await discord.leagueChannels()).find((c) => c.channelId === second)!.announcedUntil,
    ).toEqual(t1);
    await discord.setLeagueChannel(guildId, second, false, t1);
    expect((await discord.leagueChannels()).some((c) => c.guildId === guildId)).toBe(false);

    // Heimat-Mitglieder der Community
    const current = await new DrizzleSeasonRepository(conn.db).findCurrent();
    const chars = new DrizzleCharacterRepository(conn.db);
    const make = async (name: string) => {
      const [acc] = await conn.db.insert(account).values({}).returning();
      return chars.create({
        accountId: acc!.id,
        seasonId: current!.id,
        name: `${name}${Date.now() % 100000}`,
        classId: 'medtech',
        level: 1,
        xp: 0,
        allocated: { str: 0, dex: 0, int: 0, con: 0 },
        loadouts: {},
      });
    };
    const home = await make('Hm');
    const away = await make('Aw');
    await discord.ensureMember(guild.communityId, home.accountId);
    const league = new DrizzleLeagueRepository(conn.db);
    expect([...(await league.homeMembers(guild.communityId, [home.id, away.id]))]).toEqual([
      home.id,
    ]);
    expect(await league.recentCycles(randomUUID(), 2)).toEqual([]);
  });

  it('speichert Team-Ratings je Größe und Zyklen der Team-Liga', async () => {
    const teams = new DrizzleTeamRepository(conn.db);
    const guild = await new DrizzleDiscordRepository(conn.db).ensureGuildCommunity(
      `${Date.now()}7`,
      'Ligatest',
    );
    const make = async (n: string) => {
      const [acc] = await conn.db.insert(account).values({}).returning();
      await teams.joinCommunity(guild.communityId, acc!.id);
      const suffix = `${Date.now() % 100000}${n}`;
      return teams.create({
        communityId: guild.communityId,
        name: `Liga${suffix}`,
        tag: `L${randomUUID().slice(0, 4)}`,
        logo: 'wolf',
        captainAccountId: acc!.id,
        joinCode: `TL${suffix}`,
        focus: 'threat',
        lineup2: [],
        lineup3: [],
      });
    };
    const a = await make('a');
    const b = await make('b');
    const seasonId = (await new DrizzleSeasonRepository(conn.db).findCurrent())!.id;
    const repo = new DrizzleTeamLeagueRepository(conn.db);
    await repo.updateRatings(seasonId, 2, [a.id, b.id], (cur) =>
      [...cur.values()].map((r) => ({ ...r, games: 5, rating: r.teamId === a.id ? 1600 : 1400 })),
    );
    // Getrennt je Größe
    expect((await repo.ratings(seasonId, 3, [a.id])).size).toBe(0);
    expect((await repo.ratings(seasonId, 2, [a.id])).get(a.id)).toMatchObject({ rating: 1600 });
    await repo.setJoined(seasonId, 2, a.id, true);
    await repo.setJoined(seasonId, 2, b.id, true);
    expect((await repo.entrants(seasonId, 2, 5)).map((r) => r.teamId)).toEqual([a.id, b.id]);
    const board = await repo.leaderboard(seasonId, 2, { minGames: 5, limit: 50 });
    expect(board.find((r) => r.teamId === a.id)).toMatchObject({
      community: 'Ligatest',
      logo: 'wolf',
    });

    const at = (h: number) => new Date(Date.UTC(2026, 10, 12, h));
    const cycle = await repo.createCycle({
      seasonId,
      size: 2,
      number: 1,
      startsAt: at(19),
      endsAt: at(19),
      members: [
        { teamId: a.id, division: 0, ratingAtStart: 1600 },
        { teamId: b.id, division: 0, ratingAtStart: 1400 },
      ],
      matches: [
        {
          division: 0,
          matchday: 1,
          lockAt: at(18),
          playAt: at(19),
          aTeamId: a.id,
          bTeamId: b.id,
          status: 'scheduled',
        },
      ],
    });
    expect(await repo.activeCycle(seasonId, 2)).toMatchObject({ id: cycle.id, size: 2 });
    expect(await repo.activeCycle(seasonId, 3)).toBeNull();
    expect(await repo.nextEvent(cycle.id)).toEqual({ kind: 'lock', at: at(18) });
    const [m] = await repo.matches(cycle.id);
    await repo.lockMatches([{ id: m!.id, snapshots: [[], []] }]);
    expect(await repo.nextEvent(cycle.id)).toEqual({ kind: 'play', at: at(19) });
    await repo.finishMatch(m!.id, { fightId: null, winnerTeamId: a.id, draw: false });
    await repo.finishCycle(cycle.id, at(19), [
      { teamId: a.id, place: 1, movement: 'stay' },
      { teamId: b.id, place: 2, movement: 'stay' },
    ]);
    expect(await repo.lastCycle(seasonId, 2)).toMatchObject({ status: 'finished' });
    expect((await repo.members(cycle.id)).map((x) => x.place)).toEqual([1, 2]);
    // Aufräumen, damit andere Tests die laufende Season ohne Team-Liga sehen
    await teams.remove(a.id);
    await teams.remove(b.id);
    expect((await repo.ratings(seasonId, 2, [a.id, b.id])).size).toBe(0);
  });

  it('speichert Tagesgegner einmal je Tag und Anfragen mit Annahme', async () => {
    const season = (await new DrizzleSeasonRepository(conn.db).findCurrent())!;
    const chars = new DrizzleCharacterRepository(conn.db);
    const make = async (name: string) => {
      const [acc] = await conn.db.insert(account).values({}).returning();
      return chars.create({
        accountId: acc!.id,
        seasonId: season.id,
        name: `${name}${Date.now() % 100000}`,
        classId: 'gunner',
        level: 1,
        xp: 0,
        allocated: { str: 0, dex: 0, int: 0, con: 0 },
        loadouts: {},
      });
    };
    const [me, a, b] = [await make('Dm'), await make('Da'), await make('Db')];
    const repo = new DrizzlePvpRepository(conn.db);
    expect(await repo.dailyOpponents(me.id, '2026-11-12')).toEqual({ ids: [], rerolled: false });
    expect((await repo.saveDailyOpponents(me.id, '2026-11-12', [b.id, a.id])).ids).toEqual([
      b.id,
      a.id,
    ]);
    // Ein zweiter, gleichzeitiger Erstabruf überschreibt nicht
    expect((await repo.saveDailyOpponents(me.id, '2026-11-12', [a.id])).ids).toEqual([b.id, a.id]);
    expect((await repo.dailyOpponents(me.id, '2026-11-13')).ids).toEqual([]);

    // Neuwürfeln kostet Credits, nur einmal am Tag
    const charge = { seasonId: season.id, accountId: me.accountId, amount: 30 };
    await expect(
      repo.rerollDailyOpponents({ characterId: me.id, day: '2026-11-12', ids: [a.id], charge }),
    ).rejects.toThrow(InsufficientCreditsError);
    await transferCredits(conn.db, {
      seasonId: season.id,
      kind: 'test',
      lines: [
        { accountId: me.accountId, amount: 50 },
        { system: 'source:admin', amount: -50 },
      ],
    });
    expect(
      await repo.rerollDailyOpponents({
        characterId: me.id,
        day: '2026-11-12',
        ids: [a.id],
        charge,
      }),
    ).toBe(true);
    expect(await repo.dailyOpponents(me.id, '2026-11-12')).toEqual({ ids: [a.id], rerolled: true });
    expect(await creditBalance(conn.db, season.id, me.accountId)).toBe(20);
    expect(
      await repo.rerollDailyOpponents({
        characterId: me.id,
        day: '2026-11-12',
        ids: [b.id],
        charge,
      }),
    ).toBe(false);

    const request = await repo.createRequest({
      seasonId: season.id,
      challengerId: me.id,
      opponentId: a.id,
      mode: 'rated',
      expiresAt: new Date('2026-11-12T12:15:00Z'),
    });
    expect(request).toMatchObject({ status: 'pending', fightId: null });
    expect((await repo.pendingRequest(me.id, a.id))!.id).toBe(request.id);
    expect(await repo.pendingRequest(a.id, me.id)).toBeNull();
    expect(await repo.resolveRequest(request.id, 'accepted')).toBe(true);
    expect(await repo.resolveRequest(request.id, 'declined')).toBe(false);
    expect(await repo.findRequest(request.id)).toMatchObject({ status: 'accepted' });
    expect(await repo.pendingRequest(me.id, a.id)).toBeNull();
  });

  it('speichert gegnerische Tages-Teams und Team-Anfragen mit Annahme', async () => {
    const season = (await new DrizzleSeasonRepository(conn.db).findCurrent())!;
    const teams = new DrizzleTeamRepository(conn.db);
    const guild = await new DrizzleDiscordRepository(conn.db).ensureGuildCommunity(
      `${Date.now()}7`,
      'Tagesteams',
    );
    const make = async (n: number) => {
      const [acc] = await conn.db.insert(account).values({}).returning();
      await teams.joinCommunity(guild.communityId, acc!.id);
      const tag = `T${randomUUID().slice(0, 4)}`;
      return {
        account: acc!.id,
        team: await teams.create({
          communityId: guild.communityId,
          name: `Tagesteam${n}${tag}`,
          tag,
          logo: 'wolf',
          captainAccountId: acc!.id,
          joinCode: `D${randomUUID().slice(0, 7)}`,
          focus: 'threat',
          lineup2: [],
          lineup3: [],
        }),
      };
    };
    const [own, x, y] = [await make(1), await make(2), await make(3)];
    const repo = new DrizzlePvpRepository(conn.db);
    expect(await repo.dailyTeamOpponents(own.team.id, '2026-11-12')).toEqual([]);
    expect(
      await repo.saveDailyTeamOpponents(own.team.id, '2026-11-12', [y.team.id, x.team.id]),
    ).toEqual([y.team.id, x.team.id]);
    expect(await repo.saveDailyTeamOpponents(own.team.id, '2026-11-12', [x.team.id])).toEqual([
      y.team.id,
      x.team.id,
    ]);
    expect(await repo.dailyTeamOpponents(own.team.id, '2026-11-13')).toEqual([]);

    const request = await repo.createTeamRequest({
      seasonId: season.id,
      challengerTeamId: own.team.id,
      opponentTeamId: x.team.id,
      requesterAccountId: own.account,
      size: 2,
      lineup: [own.account, x.account],
      mode: 'friendly',
      expiresAt: new Date('2026-11-12T12:15:00Z'),
    });
    expect(request).toMatchObject({ status: 'pending', size: 2, fightId: null });
    expect(request.lineup).toEqual([own.account, x.account]);
    expect((await repo.pendingTeamRequest(own.team.id, x.team.id, 2))!.id).toBe(request.id);
    expect(await repo.pendingTeamRequest(own.team.id, x.team.id, 3)).toBeNull();
    expect(await repo.resolveTeamRequest(request.id, 'declined')).toBe(true);
    expect(await repo.resolveTeamRequest(request.id, 'accepted')).toBe(false);
    expect(await repo.findTeamRequest(request.id)).toMatchObject({ status: 'declined' });
    expect(await repo.pendingTeamRequest(own.team.id, x.team.id, 2)).toBeNull();
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
