import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { InsufficientCreditsError, InsufficientMaterialsError } from '@tbca/db';

import {
  DEFAULT_BATTLE_RULES,
  DEFAULT_GAME_CONFIG,
  GameClock,
  ManualTimeSource,
  type Equipment,
  type EquipSlot,
  type ItemData,
} from '@tbca/game-core';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { configureApp, createFastifyAdapter } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import type {
  AccountRepository,
  DiscordOAuth,
  ExternalProfile,
  MeProfile,
  SessionStore,
  StoredSession,
} from '../src/auth/types.js';
import {
  CharacterExistsError,
  NameTakenError,
  type CharacterRecord,
  type CharacterRepository,
} from '../src/character/types.js';
import { loadEnv, type Env } from '../src/config/env.js';
import type {
  FightTx,
  FightRepository,
  NewFight,
  RewardCounts,
  StoredFight,
} from '../src/fight/types.js';
import type { InventoryRepository, StoredItem } from '../src/inventory/types.js';
import type { DungeonRepository, DungeonRun, DungeonTx } from '../src/dungeon/types.js';
import type { DiscordRepository, GuildCommunity } from '../src/discord/types.js';
import { TeamConflictError, type TeamRecord, type TeamRepository } from '../src/team/types.js';
import { MemoryRateLimiter } from '../src/limits/rate-limiter.js';
import {
  AlreadyPurchasedError,
  ItemEquippedError,
  type EconomyChange,
  type EconomyRepository,
} from '../src/economy/types.js';
import type { CurrentSeason, SeasonRepository } from '../src/game/season.js';
import {
  ACCOUNT_REPOSITORY,
  CHARACTER_REPOSITORY,
  CLOCK,
  DB_PING,
  FIGHT_REPOSITORY,
  INVENTORY_REPOSITORY,
  ECONOMY_REPOSITORY,
  DUNGEON_REPOSITORY,
  DISCORD_REPOSITORY,
  RATE_LIMITER,
  TEAM_REPOSITORY,
  DISCORD_OAUTH,
  SEASON_REPOSITORY,
  SESSION_STORE,
} from '../src/tokens.js';

export const WEB_ORIGIN = 'http://localhost:4200';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://tbca:test@localhost:5432/unused',
    WEB_ORIGIN,
    COOKIE_SECRET: 'x'.repeat(40),
    DISCORD_CLIENT_ID: 'client-id',
    DISCORD_CLIENT_SECRET: 'client-secret',
    BOT_SERVICE_TOKEN: 'b'.repeat(40),
    ...overrides,
  });
}

export class InMemoryAccounts implements AccountRepository {
  readonly accounts = new Map<string, { identities: ExternalProfile[] }>();

  async loginWithIdentity(profile: ExternalProfile): Promise<string> {
    for (const [id, acc] of this.accounts) {
      const found = acc.identities.find(
        (i) => i.provider === profile.provider && i.providerUserId === profile.providerUserId,
      );
      if (found) {
        Object.assign(found, profile);
        return id;
      }
    }
    const id = randomUUID();
    this.accounts.set(id, { identities: [{ ...profile }] });
    return id;
  }

  async findAccountId(provider: string, providerUserId: string): Promise<string | null> {
    for (const [id, acc] of this.accounts) {
      if (
        acc.identities.some((i) => i.provider === provider && i.providerUserId === providerUserId)
      )
        return id;
    }
    return null;
  }

  async findProfile(accountId: string): Promise<MeProfile | null> {
    const acc = this.accounts.get(accountId);
    if (!acc) return null;
    return {
      account: { id: accountId, globalRole: 'player', locale: null },
      identities: acc.identities.map(({ provider, displayName, avatarUrl }) => ({
        provider,
        displayName,
        avatarUrl,
      })),
    };
  }
}

export class InMemorySessions implements SessionStore {
  readonly byHash = new Map<string, StoredSession>();

  async create(input: {
    accountId: string;
    tokenHash: string;
    csrfToken: string;
    expiresAt: Date;
    now: Date;
  }): Promise<StoredSession> {
    const s: StoredSession = {
      id: randomUUID(),
      accountId: input.accountId,
      csrfToken: input.csrfToken,
      expiresAt: input.expiresAt,
      lastSeenAt: input.now,
    };
    this.byHash.set(input.tokenHash, s);
    return s;
  }

  async findValid(tokenHash: string, now: Date): Promise<StoredSession | null> {
    const s = this.byHash.get(tokenHash);
    return s && s.expiresAt > now ? s : null;
  }

  async extend(id: string, now: Date, expiresAt: Date): Promise<void> {
    for (const s of this.byHash.values()) {
      if (s.id === id) Object.assign(s, { lastSeenAt: now, expiresAt });
    }
  }

  async delete(tokenHash: string): Promise<void> {
    this.byHash.delete(tokenHash);
  }
}

export class FakeDiscord implements DiscordOAuth {
  profile: ExternalProfile = {
    provider: 'discord',
    providerUserId: '80351110224678912',
    displayName: 'Neo',
    avatarUrl: null,
  };
  fail = false;

  authorizeUrl(state: string): string {
    return `https://discord.test/authorize?state=${state}`;
  }

  async fetchProfile(code: string): Promise<ExternalProfile> {
    if (this.fail || code !== 'valid-code') throw new Error('ungültiger Code');
    return this.profile;
  }
}

export class FakeSeasons implements SeasonRepository {
  current: CurrentSeason | null = {
    id: '01933b5e-0000-7000-8000-000000000001',
    name: 'Test Season',
    isTest: true,
    configVersion: 2,
    battle: DEFAULT_BATTLE_RULES,
    game: DEFAULT_GAME_CONFIG,
  };

  async findCurrent(): Promise<CurrentSeason | null> {
    return this.current;
  }
}

export class InMemoryCharacters implements CharacterRepository {
  readonly records: CharacterRecord[] = [];
  /** Liefert die Ausrüstung beim Laden mit, wie die Datenbank-Variante. */
  inventory: InMemoryInventory | null = null;

  private withGear(r: CharacterRecord): CharacterRecord {
    const copy = structuredClone(r);
    return this.inventory ? { ...copy, equipment: this.inventory.gearOf(r.id) } : copy;
  }
  /** Saldo je `${seasonId}:${accountId}`. */
  readonly wallets = new Map<string, number>();

  async balance(accountId: string, seasonId: string): Promise<number> {
    return this.wallets.get(`${seasonId}:${accountId}`) ?? 0;
  }

  credit(seasonId: string, accountId: string, amount: number): void {
    const key = `${seasonId}:${accountId}`;
    const next = (this.wallets.get(key) ?? 0) + amount;
    if (next < 0) throw new InsufficientCreditsError();
    this.wallets.set(key, next);
  }

  async findForAccount(accountId: string, seasonId: string): Promise<CharacterRecord | null> {
    const r = this.records.find((c) => c.accountId === accountId && c.seasonId === seasonId);
    return r ? this.withGear(r) : null;
  }

  async create(record: Omit<CharacterRecord, 'id'>): Promise<CharacterRecord> {
    if (await this.isNameTaken(record.seasonId, record.name)) throw new NameTakenError(record.name);
    if (await this.findForAccount(record.accountId, record.seasonId))
      throw new CharacterExistsError();
    const created = { ...structuredClone(record), id: randomUUID() };
    this.records.push(created);
    return structuredClone(created);
  }

  async save(record: CharacterRecord, charge?: { amount: number; kind: 'respec' }): Promise<void> {
    if (charge) this.credit(record.seasonId, record.accountId, -charge.amount);
    const index = this.records.findIndex((c) => c.id === record.id);
    this.records[index] = structuredClone(record);
  }

  async isNameTaken(seasonId: string, name: string): Promise<boolean> {
    return this.records.some(
      (c) => c.seasonId === seasonId && c.name.toLowerCase() === name.toLowerCase(),
    );
  }

  async findById(id: string): Promise<CharacterRecord | null> {
    const r = this.records.find((c) => c.id === id);
    return r ? this.withGear(r) : null;
  }

  async search(
    seasonId: string,
    query: string,
    excludeAccountId: string,
    nearLevel: number,
    limit: number,
  ) {
    return this.records
      .filter(
        (c) =>
          c.seasonId === seasonId &&
          c.accountId !== excludeAccountId &&
          c.name.toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) => Math.abs(a.level - nearLevel) - Math.abs(b.level - nearLevel))
      .slice(0, limit)
      .map(({ id, name, level, classId, isBot }) => ({
        id,
        name,
        level,
        classId,
        isBot: isBot ?? false,
      }));
  }
}

export class InMemoryInventory implements InventoryRepository {
  readonly items: (StoredItem & { accountId: string; seasonId: string })[] = [];
  readonly equipped = new Map<string, Partial<Record<EquipSlot, string>>>();

  async listItems(accountId: string, seasonId: string): Promise<StoredItem[]> {
    return this.items
      .filter((i) => i.accountId === accountId && i.seasonId === seasonId)
      .map(({ id, data, source, createdAt }) => ({ id, data, source, createdAt }));
  }

  async countItems(accountId: string, seasonId: string): Promise<number> {
    return (await this.listItems(accountId, seasonId)).length;
  }

  async addItems(
    accountId: string,
    seasonId: string,
    items: readonly { data: ItemData; source: string }[],
  ) {
    return items.map((i) => {
      const id = randomUUID();
      this.items.push({
        id,
        accountId,
        seasonId,
        data: structuredClone(i.data),
        source: i.source,
        createdAt: new Date(),
      });
      return id;
    });
  }

  async equipmentOf(characterId: string): Promise<Partial<Record<EquipSlot, string>>> {
    return { ...(this.equipped.get(characterId) ?? {}) };
  }

  async setEquipment(
    characterId: string,
    changes: Partial<Record<EquipSlot, string | null>>,
  ): Promise<void> {
    const current = { ...(this.equipped.get(characterId) ?? {}) };
    for (const [slot, itemId] of Object.entries(changes) as [EquipSlot, string | null][]) {
      if (itemId) current[slot] = itemId;
      else delete current[slot];
    }
    this.equipped.set(characterId, current);
  }

  /** Ausgerüstete Items als Daten, wie sie die Charakter-Repository liefert. */
  gearOf(characterId: string): Equipment {
    const byId = new Map(this.items.map((i) => [i.id, i.data]));
    return Object.fromEntries(
      Object.entries(this.equipped.get(characterId) ?? {}).map(([slot, id]) => [
        slot,
        byId.get(id)!,
      ]),
    );
  }
}

export class InMemoryEconomy implements EconomyRepository {
  readonly stackMap = new Map<string, Record<string, number>>();
  readonly purchaseSet = new Set<string>();

  constructor(
    private readonly characters: InMemoryCharacters,
    private readonly inventory: InMemoryInventory,
  ) {}

  async commit(change: EconomyChange): Promise<{ addedIds: string[] }> {
    const { seasonId, accountId } = change;
    // Erst alles prüfen, dann alles anwenden – wie eine Transaktion.
    const balance = await this.characters.balance(accountId, seasonId);
    if (change.credits && balance + change.credits.amount < 0) throw new InsufficientCreditsError();
    const stacks = { ...(this.stackMap.get(`${seasonId}:${accountId}`) ?? {}) };
    for (const [id, delta] of Object.entries(change.stacks ?? {})) {
      stacks[id] = (stacks[id] ?? 0) + delta;
      if (stacks[id]! < 0) throw new InsufficientMaterialsError(id);
    }
    const equipped = new Set(
      [...this.inventory.equipped.values()].flatMap((e) => Object.values(e)),
    );
    for (const id of change.deleteItems ?? []) {
      if (equipped.has(id)) throw new ItemEquippedError();
      if (!this.inventory.items.some((i) => i.id === id && i.accountId === accountId))
        throw new ItemEquippedError('fehlt');
    }
    const purchaseKey =
      change.purchase &&
      `${seasonId}:${accountId}:${change.purchase.day}:${change.purchase.offerId}`;
    if (purchaseKey && this.purchaseSet.has(purchaseKey)) throw new AlreadyPurchasedError();

    if (change.credits) this.characters.credit(seasonId, accountId, change.credits.amount);
    this.stackMap.set(`${seasonId}:${accountId}`, stacks);
    for (const id of change.deleteItems ?? []) {
      this.inventory.items.splice(
        this.inventory.items.findIndex((i) => i.id === id),
        1,
      );
    }
    for (const u of change.updateItems ?? []) {
      this.inventory.items.find((i) => i.id === u.id)!.data = structuredClone(u.data);
    }
    const addedIds = await this.inventory.addItems(accountId, seasonId, change.addItems ?? []);
    if (purchaseKey) this.purchaseSet.add(purchaseKey);
    return { addedIds };
  }

  async stacks(accountId: string, seasonId: string): Promise<Record<string, number>> {
    return Object.fromEntries(
      Object.entries(this.stackMap.get(`${seasonId}:${accountId}`) ?? {}).filter(([, q]) => q > 0),
    );
  }

  async purchases(accountId: string, seasonId: string, day: string): Promise<string[]> {
    const prefix = `${seasonId}:${accountId}:${day}:`;
    return [...this.purchaseSet]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }
}

export class InMemoryDungeon implements DungeonRepository {
  readonly runs: DungeonRun[] = [];

  constructor(
    private readonly fights: InMemoryFights,
    private readonly economy: InMemoryEconomy,
    private readonly characters: InMemoryCharacters,
  ) {}

  async locked<T>(_characterId: string, fn: (tx: DungeonTx) => Promise<T>): Promise<T> {
    return fn({
      activeRun: async (id) =>
        this.runs.find((r) => r.characterId === id && r.status === 'active') ?? null,
      runsOnDay: async (id, day) =>
        this.runs.filter((r) => r.characterId === id && r.rewardDay === day).length,
      saveRun: async (run) => {
        if (!run.id) {
          const created = { ...structuredClone(run), id: randomUUID() };
          this.runs.push(created);
          return created;
        }
        const index = this.runs.findIndex((r) => r.id === run.id);
        this.runs[index] = structuredClone(run);
        return run;
      },
      insertFight: (f) => this.fights.locked('', (tx) => tx.insert(f)),
      economy: async (change) => {
        await this.economy.commit(change);
      },
      setProgress: async (id, xp, level) => {
        Object.assign(
          this.characters.records.find((r) => r.id === id)!,
          { xp, level },
        );
      },
    });
  }

  async latestRun(characterId: string): Promise<DungeonRun | null> {
    return [...this.runs].reverse().find((r) => r.characterId === characterId) ?? null;
  }
}

export class InMemoryDiscord implements DiscordRepository {
  readonly guilds = new Map<string, { communityId: string; name: string }>();
  readonly xpChannels = new Map<string, Set<string>>();
  readonly members = new Map<string, { communityId: string; isHome: boolean }[]>();
  readonly ledger = new Map<string, number>();

  constructor(private readonly characters: InMemoryCharacters) {}

  async communityForGuild(guildId: string): Promise<GuildCommunity | null> {
    const g = this.guilds.get(guildId);
    return g ? { ...g, xpChannels: [...(this.xpChannels.get(guildId) ?? [])] } : null;
  }

  async ensureGuildCommunity(guildId: string, name: string): Promise<GuildCommunity> {
    if (!this.guilds.has(guildId)) this.guilds.set(guildId, { communityId: randomUUID(), name });
    return (await this.communityForGuild(guildId))!;
  }

  async setChannelXp(guildId: string, channelId: string, enabled: boolean): Promise<void> {
    const set = this.xpChannels.get(guildId) ?? new Set<string>();
    if (enabled) set.add(channelId);
    else set.delete(channelId);
    this.xpChannels.set(guildId, set);
  }

  async ensureMember(communityId: string, accountId: string): Promise<void> {
    const list = this.members.get(accountId) ?? [];
    if (!list.some((m) => m.communityId === communityId))
      list.push({ communityId, isHome: list.length === 0 });
    this.members.set(accountId, list);
  }

  async bookPassive(
    input: { seasonId: string; accountId: string; characterId: string; day: string },
    decide: (s: { rawToday: number; xp: number; level: number }) => {
      rawToday: number;
      awarded: number;
      xp: number;
      level: number;
    },
  ) {
    const key = `${input.seasonId}:${input.accountId}:${input.day}`;
    const c = this.characters.records.find((r) => r.id === input.characterId)!;
    const result = decide({ rawToday: this.ledger.get(key) ?? 0, xp: c.xp, level: c.level });
    const levelBefore = c.level;
    this.ledger.set(key, result.rawToday);
    if (result.awarded > 0) Object.assign(c, { xp: result.xp, level: result.level });
    return { awarded: result.awarded, level: c.level, levelBefore };
  }
}

export class InMemoryTeams implements TeamRepository {
  readonly communityList: { id: string; slug: string; name: string }[] = [
    { id: '01933b5e-0000-7000-8000-00000000c001', slug: 'dev', name: 'Dev Community' },
  ];
  readonly memberships = new Map<string, Set<string>>();
  readonly teams: TeamRecord[] = [];

  async communities(accountId: string) {
    const mine = this.memberships.get(accountId) ?? new Set();
    const first = [...mine][0];
    return this.communityList.map((c) => ({ ...c, member: mine.has(c.id), home: c.id === first }));
  }

  async joinCommunity(communityId: string, accountId: string) {
    const set = this.memberships.get(accountId) ?? new Set<string>();
    set.add(communityId);
    this.memberships.set(accountId, set);
  }

  async isCommunityMember(communityId: string, accountId: string) {
    return this.memberships.get(accountId)?.has(communityId) ?? false;
  }

  async teamsOf(accountId: string) {
    return structuredClone(this.teams.filter((t) => t.members.includes(accountId)));
  }

  async find(id: string) {
    const t = this.teams.find((x) => x.id === id);
    return t ? structuredClone(t) : null;
  }

  async findByCode(code: string) {
    const t = this.teams.find((x) => x.joinCode.toUpperCase() === code.toUpperCase());
    return t ? structuredClone(t) : null;
  }

  async search(query: string, limit: number) {
    const q = query.toLowerCase();
    return structuredClone(
      this.teams
        .filter((t) => t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q))
        .slice(0, limit),
    );
  }

  async create(record: Omit<TeamRecord, 'id' | 'members' | 'communityName'>) {
    if (this.teams.some((t) => t.name.toLowerCase() === record.name.toLowerCase()))
      throw new TeamConflictError('team_name_taken');
    if (this.teams.some((t) => t.tag.toLowerCase() === record.tag.toLowerCase()))
      throw new TeamConflictError('team_tag_taken');
    if (
      this.teams.some(
        (t) => t.communityId === record.communityId && t.members.includes(record.captainAccountId!),
      )
    ) {
      throw new TeamConflictError('already_in_team');
    }
    const t: TeamRecord = {
      ...record,
      id: randomUUID(),
      communityName: this.communityList.find((c) => c.id === record.communityId)?.name ?? '',
      members: record.captainAccountId ? [record.captainAccountId] : [],
    };
    this.teams.push(t);
    return structuredClone(t);
  }

  async addMember(record: TeamRecord, accountId: string) {
    if (
      this.teams.some((t) => t.communityId === record.communityId && t.members.includes(accountId))
    ) {
      throw new TeamConflictError('already_in_team');
    }
    this.teams.find((t) => t.id === record.id)!.members.push(accountId);
  }

  async removeMember(teamId: string, accountId: string) {
    const t = this.teams.find((x) => x.id === teamId)!;
    t.members = t.members.filter((m) => m !== accountId);
  }

  async update(
    teamId: string,
    patch: Partial<Pick<TeamRecord, 'captainAccountId' | 'focus' | 'lineup2' | 'lineup3'>>,
  ) {
    Object.assign(
      this.teams.find((x) => x.id === teamId)!,
      structuredClone(patch),
    );
  }

  async remove(teamId: string) {
    this.teams.splice(
      this.teams.findIndex((t) => t.id === teamId),
      1,
    );
  }
}

export class InMemoryFights implements FightRepository {
  readonly fights: StoredFight[] = [];

  constructor(private readonly characters: InMemoryCharacters) {}

  async lockedMany<T>(_ids: readonly string[], fn: (tx: FightTx) => Promise<T>): Promise<T> {
    return this.locked('', fn);
  }

  async locked<T>(_characterId: string, fn: (tx: FightTx) => Promise<T>): Promise<T> {
    return fn({
      rewardCounts: (id, day) => this.rewardCounts(id, day),
      insert: async (f: NewFight) => {
        const id = randomUUID();
        this.fights.push({
          ...structuredClone(f),
          id,
          createdAt: new Date(),
          engineVersion: f.result.engineVersion,
        });
        return id;
      },
      setProgress: async (id, xp, level) => {
        const c = this.characters.records.find((r) => r.id === id)!;
        Object.assign(c, { xp, level });
      },
      rewardCredits: async (seasonId, accountId, amount) => {
        this.characters.credit(seasonId, accountId, amount);
      },
    });
  }

  async rewardCounts(characterId: string, day: string): Promise<RewardCounts> {
    const byOpponent = new Map<string, number>();
    let today = 0;
    for (const f of this.fights.filter((x) => x.rewardDay === day)) {
      for (const p of f.participants) {
        if (p.characterId !== characterId || !p.rewarded) continue;
        today++;
        const key = p.opponentTeamId ?? p.opponentCharacterId;
        if (key) byOpponent.set(key, (byOpponent.get(key) ?? 0) + 1);
      }
    }
    return { today, byOpponent };
  }

  async findById(id: string): Promise<StoredFight | null> {
    return this.fights.find((f) => f.id === id) ?? null;
  }

  async listForCharacter(characterId: string, limit: number): Promise<StoredFight[]> {
    return this.fights
      .filter((f) => f.participants.some((p) => p.characterId === characterId))
      .reverse()
      .slice(0, limit);
  }
}

export interface TestApp {
  app: NestFastifyApplication;
  accounts: InMemoryAccounts;
  sessions: InMemorySessions;
  discord: FakeDiscord;
  seasons: FakeSeasons;
  characters: InMemoryCharacters;
  fights: InMemoryFights;
  inventory: InMemoryInventory;
  economy: InMemoryEconomy;
  dungeon: InMemoryDungeon;
  guilds: InMemoryDiscord;
  teams: InMemoryTeams;
  time: ManualTimeSource;
  dbUp: { value: boolean };
}

export async function createTestApp(env: Env = testEnv()): Promise<TestApp> {
  const accounts = new InMemoryAccounts();
  const sessions = new InMemorySessions();
  const discord = new FakeDiscord();
  const seasons = new FakeSeasons();
  const characters = new InMemoryCharacters();
  const fights = new InMemoryFights(characters);
  const inventory = new InMemoryInventory();
  characters.inventory = inventory;
  const economy = new InMemoryEconomy(characters, inventory);
  const dungeon = new InMemoryDungeon(fights, economy, characters);
  const guilds = new InMemoryDiscord(characters);
  const teams = new InMemoryTeams();
  // 12.11.2026, 12:00 Uhr in Berlin
  const time = new ManualTimeSource(Date.UTC(2026, 10, 12, 11, 0));
  const dbUp = { value: true };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
    .overrideProvider(ACCOUNT_REPOSITORY)
    .useValue(accounts)
    .overrideProvider(SESSION_STORE)
    .useValue(sessions)
    .overrideProvider(DISCORD_OAUTH)
    .useValue(discord)
    .overrideProvider(SEASON_REPOSITORY)
    .useValue(seasons)
    .overrideProvider(CHARACTER_REPOSITORY)
    .useValue(characters)
    .overrideProvider(FIGHT_REPOSITORY)
    .useValue(fights)
    .overrideProvider(INVENTORY_REPOSITORY)
    .useValue(inventory)
    .overrideProvider(ECONOMY_REPOSITORY)
    .useValue(economy)
    .overrideProvider(DUNGEON_REPOSITORY)
    .useValue(dungeon)
    .overrideProvider(DISCORD_REPOSITORY)
    .useValue(guilds)
    .overrideProvider(TEAM_REPOSITORY)
    .useValue(teams)
    .overrideProvider(RATE_LIMITER)
    .useValue(new MemoryRateLimiter(time.read))
    .overrideProvider(CLOCK)
    .useValue(new GameClock({ source: time.read }))
    .overrideProvider(DB_PING)
    .useValue(async () => {
      if (!dbUp.value) throw new Error('down');
    })
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(env), {
    logger: false,
  });
  await configureApp(app, env);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return {
    app,
    accounts,
    sessions,
    discord,
    seasons,
    characters,
    fights,
    inventory,
    economy,
    dungeon,
    guilds,
    teams,
    time,
    dbUp,
  };
}

/** Liest Set-Cookie-Header als Map name → { value, attribute-string }. */
export function cookiesOf(headers: Record<string, unknown>): Map<string, string> {
  const raw = headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const map = new Map<string, string>();
  for (const c of list as string[]) {
    const [pair] = c.split(';');
    const index = pair!.indexOf('=');
    map.set(pair!.slice(0, index), c);
  }
  return map;
}

export function cookieValue(setCookie: string | undefined): string {
  if (!setCookie) throw new Error('Cookie fehlt');
  const pair = setCookie.split(';')[0]!;
  return pair.slice(pair.indexOf('=') + 1);
}

/** Spielt den Discord-Login bis zum Session-Cookie durch. */
export async function login(
  t: TestApp,
  providerUserId = '80351110224678912',
): Promise<{ cookie: string; csrfToken: string }> {
  t.discord.profile = { ...t.discord.profile, providerUserId };
  const start = await t.app.inject({ method: 'GET', url: '/api/auth/discord' });
  const state = new URL(start.headers.location as string).searchParams.get('state')!;
  const stateCookie = cookiesOf(start.headers).get('tbca_oauth_state')!;
  const callback = await t.app.inject({
    method: 'GET',
    url: `/api/auth/discord/callback?code=valid-code&state=${state}`,
    cookies: { tbca_oauth_state: cookieValue(stateCookie) },
  });
  const cookie = cookieValue(cookiesOf(callback.headers).get('tbca_session'));
  const me = await t.app.inject({
    method: 'GET',
    url: '/api/auth/me',
    cookies: { tbca_session: cookie },
  });
  return { cookie, csrfToken: me.json().csrfToken as string };
}
