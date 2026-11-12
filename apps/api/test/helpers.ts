import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { InsufficientCreditsError, InsufficientMaterialsError } from '@tbca/db';

import {
  DEFAULT_BATTLE_RULES,
  DEFAULT_GAME_CONFIG,
  GameClock,
  ManualTimeSource,
  type CombatantSnapshot,
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
import {
  TeamConflictError,
  type CommunityRole,
  type TeamRecord,
  type TeamRepository,
} from '../src/team/types.js';
import type { AccountDataRepository } from '../src/account/types.js';
import type {
  AccountOverview,
  AdminRepository,
  AuditEntry,
  AdminExportRepository,
  DailyResetEntry,
  ExportRows,
  SeasonAdminRepository,
  SeasonStats,
} from '../src/admin/types.js';
import type { ConfigRepository, ConfigVersionInfo } from '../src/admin/config.repository.js';
import type { BotInfo, BotRepository } from '../src/bots/bot.repository.js';
import type { BotAgent, SeasonConfigData } from '@tbca/db';
import { MemoryRateLimiter } from '../src/limits/rate-limiter.js';
import {
  AlreadyPurchasedError,
  ItemEquippedError,
  type EconomyChange,
  type EconomyRepository,
} from '../src/economy/types.js';
import type { CurrentSeason, SeasonRepository } from '../src/game/season.js';
import { GLICKO_START } from '../src/league/glicko2.js';
import type {
  CycleRecord,
  LeagueRepository,
  MatchRecord,
  MemberRecord,
  RatingRecord,
} from '../src/league/types.js';
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
  ADMIN_REPOSITORY,
  ADMIN_EXPORT_REPOSITORY,
  SEASON_ADMIN_REPOSITORY,
  CONFIG_REPOSITORY,
  BOT_REPOSITORY,
  ACCOUNT_DATA_REPOSITORY,
  DISCORD_OAUTH,
  LEAGUE_REPOSITORY,
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

/** Fortlaufende Reihenfolge statt Uhrzeit: Einträge derselben Millisekunde bleiben unterscheidbar. */
let sequence = 0;
const nextSeq = () => ++sequence;

export class InMemoryAccounts implements AccountRepository {
  readonly accounts = new Map<string, { identities: ExternalProfile[] }>();
  readonly roles = new Map<string, 'player' | 'superadmin'>();
  readonly banned = new Set<string>();

  async status(accountId: string) {
    if (!this.accounts.has(accountId)) return null;
    return {
      globalRole: this.roles.get(accountId) ?? ('player' as const),
      banned: this.banned.has(accountId),
    };
  }

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

  /** Zuletzt verwendete Rücksprung-Adresse. */
  redirectUri: string | null = null;

  authorizeUrl(state: string, redirectUri: string): string {
    this.redirectUri = redirectUri;
    return `https://discord.test/authorize?state=${state}`;
  }

  async fetchProfile(code: string, redirectUri: string): Promise<ExternalProfile> {
    if (redirectUri !== this.redirectUri) throw new Error('andere Rücksprung-Adresse');
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
    clock: { factor: 1, anchorReal: null, anchorGame: null },
  };

  async findCurrent(): Promise<CurrentSeason | null> {
    return this.current;
  }

  async setClock(_seasonId: string, clock: { factor: number; anchorReal: Date; anchorGame: Date }) {
    this.current = { ...this.current!, clock };
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

  async rename(record: CharacterRecord, name: string, cost: number, at: Date): Promise<void> {
    if (
      this.records.some(
        (r) =>
          r.seasonId === record.seasonId &&
          r.id !== record.id &&
          r.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new NameTakenError(name);
    }
    this.credit(record.seasonId, record.accountId, -cost);
    Object.assign(
      this.records.find((r) => r.id === record.id)!,
      { name, renamedAt: at },
    );
  }

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

  async levels(seasonId: string): Promise<number[]> {
    return this.records
      .filter((c) => c.seasonId === seasonId && !(c as { isBot?: boolean }).isBot)
      .map((c) => c.level);
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
  readonly seq = new Map<string, number>();
  resets: InMemorySeasonAdmin | null = null;

  constructor(
    private readonly fights: InMemoryFights,
    private readonly economy: InMemoryEconomy,
    private readonly characters: InMemoryCharacters,
  ) {}

  async locked<T>(_characterId: string, fn: (tx: DungeonTx) => Promise<T>): Promise<T> {
    return fn({
      activeRun: async (id) =>
        this.runs.find((r) => r.characterId === id && r.status === 'active') ?? null,
      runsOnDay: async (id, day) => {
        const since = this.resets?.since('dungeon', id, day) ?? 0;
        return this.runs.filter(
          (r) => r.characterId === id && r.rewardDay === day && (this.seq.get(r.id!) ?? 0) > since,
        ).length;
      },
      saveRun: async (run) => {
        if (!run.id) {
          const created = { ...structuredClone(run), id: randomUUID() };
          this.seq.set(created.id, nextSeq());
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

  async idleRuns(before: Date) {
    return this.runs
      .filter((r) => r.status === 'active' && r.lastActionAt < before)
      .map(({ characterId, accountId }) => ({ characterId, accountId }));
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

  readonly leagueNews = new Map<
    string,
    { guildId: string; communityId: string; announcedUntil: Date; enabled: boolean }
  >();

  async setLeagueChannel(guildId: string, channelId: string, enabled: boolean, from: Date) {
    const g = this.guilds.get(guildId);
    if (!g) throw new Error('Server ist keiner Community zugeordnet');
    if (enabled)
      for (const row of this.leagueNews.values()) if (row.guildId === guildId) row.enabled = false;
    const prev = this.leagueNews.get(channelId);
    this.leagueNews.set(channelId, {
      guildId,
      communityId: g.communityId,
      enabled,
      announcedUntil: enabled ? from : (prev?.announcedUntil ?? from),
    });
  }

  async leagueChannels() {
    return [...this.leagueNews.entries()]
      .filter(([, r]) => r.enabled)
      .map(([channelId, r]) => ({
        guildId: r.guildId,
        channelId,
        communityId: r.communityId,
        announcedUntil: r.announcedUntil,
      }));
  }

  async markLeagueAnnounced(channelId: string, until: Date) {
    const row = this.leagueNews.get(channelId);
    if (row) row.announcedUntil = until;
  }

  readonly roles = new Map<string, string>();

  async setRole(communityId: string, accountId: string, role: 'member' | 'moderator' | 'admin') {
    this.roles.set(`${communityId}:${accountId}`, role);
  }

  async ensureMember(communityId: string, accountId: string): Promise<void> {
    const list = this.members.get(accountId) ?? [];
    if (!list.some((m) => m.communityId === communityId))
      list.push({ communityId, isHome: list.length === 0 });
    this.members.set(accountId, list);
  }

  async passiveRaw(input: { seasonId: string; accountId: string; day: string }) {
    return this.ledger.get(`${input.seasonId}:${input.accountId}:${input.day}`) ?? 0;
  }

  async bookPassive(
    input: {
      seasonId: string;
      accountId: string;
      characterId: string;
      day: string;
      messages?: number;
    },
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
  readonly roles = new Map<string, CommunityRole>();
  readonly teams: TeamRecord[] = [];

  async communities(accountId: string) {
    const mine = this.memberships.get(accountId) ?? new Set();
    const first = [...mine][0];
    return this.communityList.map((c) => ({
      ...c,
      member: mine.has(c.id),
      home: c.id === first,
      role: mine.has(c.id) ? (this.roles.get(`${c.id}:${accountId}`) ?? 'member') : null,
    }));
  }

  async members(communityId: string) {
    return [...this.memberships.entries()]
      .filter(([, set]) => set.has(communityId))
      .map(([accountId]) => ({
        accountId,
        role: this.roles.get(`${communityId}:${accountId}`) ?? ('member' as const),
        isHome: [...(this.memberships.get(accountId) ?? [])][0] === communityId,
        joinedAt: new Date(),
      }));
  }

  async setRole(communityId: string, accountId: string, role: CommunityRole) {
    if (!this.memberships.get(accountId)?.has(communityId)) return false;
    this.roles.set(`${communityId}:${accountId}`, role);
    return true;
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

export class InMemoryAdmin implements AdminRepository {
  readonly entries: AuditEntry[] = [];

  constructor(
    private readonly accounts: InMemoryAccounts,
    private readonly characters: InMemoryCharacters,
    private readonly sessions: InMemorySessions,
  ) {}

  async audit(entry: Omit<AuditEntry, 'id' | 'createdAt'>) {
    this.entries.unshift({ ...entry, id: randomUUID(), createdAt: new Date() });
  }

  async auditLog(limit: number) {
    return this.entries.slice(0, limit);
  }

  async searchAccounts(seasonId: string, query: string, limit: number): Promise<AccountOverview[]> {
    const q = query.toLowerCase();
    return [...this.accounts.accounts.entries()]
      .filter(([id, acc]) => {
        const c = this.characters.records.find(
          (r) => r.accountId === id && r.seasonId === seasonId,
        );
        return (
          acc.identities.some((i) => i.displayName.toLowerCase().includes(q)) ||
          c?.name.toLowerCase().includes(q)
        );
      })
      .slice(0, limit)
      .map(([id, acc]) => {
        const c = this.characters.records.find(
          (r) => r.accountId === id && r.seasonId === seasonId,
        );
        return {
          accountId: id,
          identities: acc.identities.map((i) => ({
            provider: i.provider,
            displayName: i.displayName,
            providerUserId: i.providerUserId,
          })),
          character: c ? { id: c.id, name: c.name, level: c.level, xp: c.xp } : null,
          globalRole: this.accounts.roles.get(id) ?? 'player',
          isBot: false,
          bannedAt: this.accounts.banned.has(id) ? new Date() : null,
          bannedReason: null,
        };
      });
  }

  async setBan(accountId: string, reason: string | null) {
    if (!this.accounts.accounts.has(accountId)) return false;
    if (reason === null) this.accounts.banned.delete(accountId);
    else this.accounts.banned.add(accountId);
    return true;
  }

  async setProgress(characterId: string, xp: number, level: number) {
    Object.assign(
      this.characters.records.find((r) => r.id === characterId)!,
      { xp, level },
    );
  }

  async revokeSessions(accountId: string) {
    for (const [hash, s] of this.sessions.byHash)
      if (s.accountId === accountId) this.sessions.byHash.delete(hash);
  }
}

export class InMemoryConfigs implements ConfigRepository {
  readonly versions: (ConfigVersionInfo & { seasonId: string; data: SeasonConfigData })[] = [];

  constructor(seasonId: string) {
    this.versions.push({
      seasonId,
      version: 2,
      status: 'published',
      notes: null,
      createdAt: new Date(),
      publishedAt: new Date(),
      data: { battle: DEFAULT_BATTLE_RULES, game: DEFAULT_GAME_CONFIG },
    });
  }

  async list(seasonId: string) {
    return this.versions
      .filter((v) => v.seasonId === seasonId)
      .sort((a, b) => b.version - a.version);
  }
  async get(seasonId: string, version: number) {
    return structuredClone(
      this.versions.find((v) => v.seasonId === seasonId && v.version === version) ?? null,
    );
  }
  async createDraft(seasonId: string, data: SeasonConfigData, notes: string | null) {
    const version = Math.max(...this.versions.map((v) => v.version)) + 1;
    this.versions.push({
      seasonId,
      version,
      status: 'draft',
      notes,
      createdAt: new Date(),
      publishedAt: null,
      data: structuredClone(data),
    });
    return version;
  }
  async updateDraft(
    seasonId: string,
    version: number,
    data: SeasonConfigData,
    notes: string | null,
  ) {
    Object.assign(
      this.versions.find((v) => v.seasonId === seasonId && v.version === version)!,
      { data: structuredClone(data), notes },
    );
  }
  async publish(seasonId: string, version: number) {
    for (const v of this.versions)
      if (v.seasonId === seasonId && v.status === 'published') v.status = 'archived';
    Object.assign(
      this.versions.find((v) => v.version === version)!,
      { status: 'published', publishedAt: new Date() },
    );
  }
}

export class InMemoryBots implements BotRepository {
  readonly agents = new Map<string, BotAgent | null>();

  constructor(private readonly characters: InMemoryCharacters) {}

  async list(seasonId: string): Promise<BotInfo[]> {
    return this.characters.records
      .filter((c) => c.seasonId === seasonId && c.isBot)
      .map((c) => ({
        accountId: c.accountId,
        agent: this.agents.get(c.accountId) ?? null,
        character: { id: c.id, name: c.name, level: c.level, classId: c.classId },
      }));
  }
  async setAgent(accountId: string, agent: BotAgent | null) {
    if (!this.characters.records.some((c) => c.accountId === accountId && c.isBot)) return false;
    this.agents.set(accountId, agent);
    return true;
  }
}

export class InMemoryAccountData implements AccountDataRepository {
  readonly locales = new Map<string, 'de' | 'en' | null>();

  constructor(
    private readonly accounts: InMemoryAccounts,
    private readonly characters: InMemoryCharacters,
    private readonly sessions: InMemorySessions,
    private readonly fights: InMemoryFights,
  ) {}

  async export(accountId: string) {
    return {
      account: { id: accountId, locale: this.locales.get(accountId) ?? null },
      identities: this.accounts.accounts.get(accountId)?.identities ?? [],
      characters: this.characters.records.filter((c) => c.accountId === accountId),
    };
  }

  async delete(accountId: string, placeholderName: string) {
    const ids = new Set(
      this.characters.records.filter((c) => c.accountId === accountId).map((c) => c.id),
    );
    for (const f of this.fights.fights) {
      f.input = {
        ...f.input,
        teams: f.input.teams.map((t) =>
          t.map((c) => (ids.has(c.id) ? { ...c, name: placeholderName } : c)),
        ),
      };
    }
    this.accounts.accounts.delete(accountId);
    for (let i = this.characters.records.length - 1; i >= 0; i--) {
      if (this.characters.records[i]!.accountId === accountId) this.characters.records.splice(i, 1);
    }
    for (const [hash, s] of this.sessions.byHash)
      if (s.accountId === accountId) this.sessions.byHash.delete(hash);
  }

  async setLocale(accountId: string, locale: 'de' | 'en' | null) {
    this.locales.set(accountId, locale);
  }
}

export class InMemoryFights implements FightRepository {
  readonly fights: StoredFight[] = [];
  /** Reihenfolge der Kämpfe für zurückgesetzte Tageslimits. */
  readonly seq = new Map<string, number>();
  resets: InMemorySeasonAdmin | null = null;

  constructor(private readonly characters: InMemoryCharacters) {}

  async lockedMany<T>(_ids: readonly string[], fn: (tx: FightTx) => Promise<T>): Promise<T> {
    return this.locked('', fn);
  }

  async locked<T>(_characterId: string, fn: (tx: FightTx) => Promise<T>): Promise<T> {
    return fn({
      rewardCounts: (id, day) => this.rewardCounts(id, day),
      insert: async (f: NewFight) => {
        const id = randomUUID();
        this.seq.set(id, nextSeq());
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
    const since = this.resets?.since('fights', characterId, day) ?? 0;
    for (const f of this.fights.filter(
      (x) => x.rewardDay === day && (this.seq.get(x.id) ?? 0) > since,
    )) {
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

export class InMemorySeasonAdmin implements SeasonAdminRepository {
  readonly resets: {
    seasonId: string;
    characterId: string | null;
    kind: 'dungeon' | 'fights';
    day: string;
    seq: number;
    createdAt: Date;
  }[] = [];
  info_ = {
    slug: 'test-season',
    startsAt: new Date('2026-11-01T00:00:00Z'),
    endsAt: new Date('2027-01-31T00:00:00Z'),
  };

  constructor(
    private readonly characters: InMemoryCharacters,
    private readonly fights: InMemoryFights,
    private readonly dungeon: InMemoryDungeon,
    private readonly guilds: InMemoryDiscord,
    private readonly inventory: InMemoryInventory,
  ) {
    fights.resets = this;
    dungeon.resets = this;
  }

  /** Reihenfolge-Marke der jüngsten passenden Rücksetzung (0 = keine). */
  since(kind: 'dungeon' | 'fights', characterId: string, day: string): number {
    const seasonId = this.characters.records.find((r) => r.id === characterId)?.seasonId;
    return Math.max(
      0,
      ...this.resets
        .filter(
          (r) =>
            r.kind === kind &&
            r.day === day &&
            (r.characterId === characterId || (r.characterId === null && r.seasonId === seasonId)),
        )
        .map((r) => r.seq),
    );
  }

  async info(_seasonId: string) {
    return this.info_;
  }

  async stats(seasonId: string, day: string): Promise<SeasonStats> {
    const fights = this.fights.fights.filter((f) => f.seasonId === seasonId && f.rewardDay === day);
    const runs = this.dungeon.runs.filter((r) => r.seasonId === seasonId && r.rewardDay === day);
    const played = new Set([
      ...fights.flatMap((f) => f.participants.map((p) => p.characterId)),
      ...runs.map((r) => r.characterId),
    ]);
    played.delete(null as unknown as string);
    const chars = this.characters.records.filter((r) => r.seasonId === seasonId);
    return {
      characters: chars.filter((c) => !c.isBot).length,
      bots: chars.filter((c) => c.isBot).length,
      playedToday: played.size,
      dungeonRunsToday: runs.length,
      activeRuns: this.dungeon.runs.filter((r) => r.seasonId === seasonId && r.status === 'active')
        .length,
      rewardedFightsToday: fights.reduce(
        (n, f) => n + f.participants.filter((p) => p.rewarded).length,
        0,
      ),
      passiveXpToday: 0,
    };
  }

  async resetsOn(seasonId: string, day: string): Promise<DailyResetEntry[]> {
    return this.resets
      .filter((r) => r.seasonId === seasonId && r.day === day)
      .reverse()
      .map((r) => ({
        kind: r.kind,
        characterName: this.characters.records.find((c) => c.id === r.characterId)?.name ?? null,
        createdAt: r.createdAt,
      }));
  }

  async resetDaily(input: Parameters<SeasonAdminRepository['resetDaily']>[0]) {
    for (const kind of input.kinds) {
      if (kind === 'passive') {
        for (const key of this.guilds.ledger.keys()) {
          const [seasonId, accountId, day] = key.split(':');
          if (
            seasonId === input.seasonId &&
            day === input.day &&
            (!input.account || accountId === input.account.accountId)
          )
            this.guilds.ledger.set(key, 0);
        }
        continue;
      }
      this.resets.push({
        seasonId: input.seasonId,
        characterId: input.account?.characterId ?? null,
        kind,
        day: input.day,
        seq: nextSeq(),
        createdAt: new Date(),
      });
    }
  }

  async resetSeason(seasonId: string, mode: 'progress' | 'wipe') {
    const take = <T>(list: T[], hit: (x: T) => boolean): number => {
      let removed = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        if (hit(list[i]!)) {
          list.splice(i, 1);
          removed++;
        }
      }
      return removed;
    };
    const fights = take(this.fights.fights, (f) => f.seasonId === seasonId);
    const runs = take(this.dungeon.runs, (r) => r.seasonId === seasonId);
    const items = take(this.inventory.items, (i) => i.seasonId === seasonId);
    for (const key of [...this.characters.wallets.keys()])
      if (key.startsWith(`${seasonId}:`)) this.characters.wallets.delete(key);
    for (const key of [...this.guilds.ledger.keys()])
      if (key.startsWith(`${seasonId}:`)) this.guilds.ledger.delete(key);
    take(this.resets, (r) => r.seasonId === seasonId);
    const removed =
      mode === 'wipe'
        ? take(this.characters.records, (c) => c.seasonId === seasonId && !c.isBot)
        : 0;
    const rest = this.characters.records.filter((c) => c.seasonId === seasonId);
    for (const c of rest)
      Object.assign(c, { level: 1, xp: 0, allocated: { str: 0, dex: 0, int: 0, con: 0 } });
    return { characters: removed + rest.length, fights, runs, items };
  }

  async setEnd(_seasonId: string, endsAt: Date) {
    this.info_ = { ...this.info_, endsAt };
  }
}

export class InMemoryExport implements AdminExportRepository {
  constructor(
    private readonly characters: InMemoryCharacters,
    private readonly fights: InMemoryFights,
    private readonly dungeon: InMemoryDungeon,
    private readonly inventory: InMemoryInventory,
  ) {}

  async rows(seasonId: string, since: Date, limit: number): Promise<ExportRows> {
    return {
      characters: this.characters.records
        .filter((c) => c.seasonId === seasonId)
        .map((c) => ({
          id: c.id,
          isBot: Boolean(c.isBot),
          classId: c.classId,
          level: c.level,
          xp: c.xp,
          allocated: { ...c.allocated },
          createdAt: new Date(),
          loadout: (c.loadouts[c.classId] as ExportRows['characters'][0]['loadout']) ?? null,
          equipment: Object.entries(this.inventory.gearOf(c.id)).map(([slot, item]) => ({
            slot,
            item: item!,
          })),
        })),
      fights: this.fights.fights
        .filter((f) => f.seasonId === seasonId && f.createdAt >= since)
        .reverse()
        .slice(0, limit)
        .map((f) => ({
          kind: f.kind,
          createdAt: f.createdAt,
          rewardDay: f.rewardDay,
          configVersion: f.configVersion,
          engineVersion: f.engineVersion,
          rounds: f.result.rounds,
          winnerTeam: f.result.winner,
          reason: f.result.reason,
          teams: f.input.teams,
          participants: f.participants,
        })),
      runs: this.dungeon.runs
        .filter((r) => r.seasonId === seasonId)
        .map((r) => ({
          characterId: r.characterId,
          classId: r.snapshot.classId,
          level: r.snapshot.level,
          floor: r.floor,
          status: r.status,
          xpGained: r.xpGained,
          lootCredits: r.loot.credits,
          lootItems: r.loot.items.length,
          injectors: r.injectors,
          backupChip: r.backupChip,
          rewardDay: r.rewardDay,
        })),
      credits: [],
      items: [],
      purchases: [],
      passive: [],
    };
  }
}

export class InMemoryLeague implements LeagueRepository {
  readonly ratingRows = new Map<string, RatingRecord>();
  readonly cycles: CycleRecord[] = [];
  readonly memberRows: MemberRecord[] = [];
  readonly matchRows: MatchRecord[] = [];
  /** Heimat-Community je Account, für die Community-Rangliste. */
  readonly homes = new Map<string, string>();
  /** Mitgliedschaften aus dem Discord-Fake, falls gesetzt. */
  discord: InMemoryDiscord | null = null;

  private homeOf(accountId: string): string | undefined {
    return (
      this.homes.get(accountId) ??
      this.discord?.members.get(accountId)?.find((m) => m.isHome)?.communityId
    );
  }

  constructor(private readonly characters: InMemoryCharacters) {}

  private fresh(seasonId: string, characterId: string): RatingRecord {
    return {
      characterId,
      seasonId,
      ...GLICKO_START,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      leagueJoined: false,
    };
  }

  async ratings(ids: readonly string[]) {
    return new Map(
      ids
        .filter((id) => this.ratingRows.has(id))
        .map((id) => [id, { ...this.ratingRows.get(id)! }]),
    );
  }

  async updateRatings(
    seasonId: string,
    ids: readonly string[],
    update: (current: Map<string, RatingRecord>) => RatingRecord[],
  ) {
    for (const id of ids)
      if (!this.ratingRows.has(id)) this.ratingRows.set(id, this.fresh(seasonId, id));
    const next = update(new Map(ids.map((id) => [id, { ...this.ratingRows.get(id)! }])));
    for (const r of next)
      this.ratingRows.set(r.characterId, {
        ...r,
        leagueJoined: this.ratingRows.get(r.characterId)!.leagueJoined,
      });
    return next;
  }

  async setJoined(seasonId: string, characterId: string, joined: boolean) {
    const row = this.ratingRows.get(characterId) ?? this.fresh(seasonId, characterId);
    const next = { ...row, leagueJoined: joined };
    this.ratingRows.set(characterId, next);
    return { ...next };
  }

  async entrants(seasonId: string, minGames: number) {
    return [...this.ratingRows.values()]
      .filter((r) => r.seasonId === seasonId && r.leagueJoined && r.games >= minGames)
      .sort((a, b) => b.rating - a.rating || (a.characterId < b.characterId ? -1 : 1));
  }

  async leaderboard(
    seasonId: string,
    options: { minGames: number; limit: number; homeOfAccount: string | null },
  ) {
    const home = options.homeOfAccount ? this.homeOf(options.homeOfAccount) : null;
    return [...this.ratingRows.values()]
      .filter((r) => r.seasonId === seasonId && r.games >= options.minGames)
      .map((r) => ({ r, c: this.characters.records.find((c) => c.id === r.characterId)! }))
      .filter(
        ({ c }) =>
          c && (options.homeOfAccount === null || (home && this.homeOf(c.accountId) === home)),
      )
      .sort((a, b) => b.r.rating - a.r.rating)
      .slice(0, options.limit)
      .map(({ r, c }) => ({
        ...r,
        name: c.name,
        level: c.level,
        classId: c.classId,
        isBot: c.isBot ?? false,
      }));
  }

  async activeCycle(seasonId: string) {
    return this.cycles.find((c) => c.seasonId === seasonId && c.status === 'active') ?? null;
  }

  async lastCycle(seasonId: string) {
    return (
      this.cycles.filter((c) => c.seasonId === seasonId).sort((a, b) => b.number - a.number)[0] ??
      null
    );
  }

  async findCycle(id: string) {
    return this.cycles.find((c) => c.id === id) ?? null;
  }

  async recentCycles(seasonId: string, limit: number) {
    return this.cycles
      .filter((c) => c.seasonId === seasonId)
      .sort((a, b) => b.number - a.number)
      .slice(0, limit);
  }

  async homeMembers(communityId: string, characterIds: readonly string[]) {
    return new Set(
      characterIds.filter((id) => {
        const c = this.characters.records.find((x) => x.id === id);
        return c !== undefined && this.homeOf(c.accountId) === communityId;
      }),
    );
  }

  async createCycle(input: Parameters<LeagueRepository['createCycle']>[0]) {
    if (this.cycles.some((c) => c.seasonId === input.seasonId && c.number === input.number))
      throw new Error('league_cycle_season_number_idx');
    const cycle: CycleRecord = {
      id: randomUUID(),
      seasonId: input.seasonId,
      number: input.number,
      status: 'active',
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      finishedAt: null,
    };
    this.cycles.push(cycle);
    for (const m of input.members)
      this.memberRows.push({ ...m, cycleId: cycle.id, place: null, movement: null });
    for (const m of input.matches)
      this.matchRows.push({
        ...m,
        id: randomUUID(),
        cycleId: cycle.id,
        snapshots: null,
        fightId: null,
        winnerCharacterId: null,
        draw: false,
      });
    return cycle;
  }

  async members(cycleId: string) {
    return this.memberRows.filter((m) => m.cycleId === cycleId).map((m) => ({ ...m }));
  }

  async matches(cycleId: string) {
    return this.matchRows
      .filter((m) => m.cycleId === cycleId)
      .sort((a, b) => a.matchday - b.matchday || a.division - b.division)
      .map((m) => ({ ...m }));
  }

  async nextEvent(cycleId: string) {
    const open = this.matchRows.filter((m) => m.cycleId === cycleId);
    const lock = open
      .filter((m) => m.status === 'scheduled')
      .map((m) => m.lockAt.getTime())
      .sort((a, b) => a - b)[0];
    const play = open
      .filter((m) => m.status === 'locked')
      .map((m) => m.playAt.getTime())
      .sort((a, b) => a - b)[0];
    if (lock !== undefined && (play === undefined || lock <= play))
      return { kind: 'lock' as const, at: new Date(lock) };
    return play !== undefined ? { kind: 'play' as const, at: new Date(play) } : null;
  }

  async lockMatches(updates: { id: string; snapshots: CombatantSnapshot[] }[]) {
    for (const u of updates) {
      const m = this.matchRows.find((x) => x.id === u.id && x.status === 'scheduled');
      if (m) Object.assign(m, { status: 'locked', snapshots: u.snapshots });
    }
  }

  async finishMatch(
    id: string,
    result: { fightId: string | null; winnerCharacterId: string | null; draw: boolean },
  ) {
    const m = this.matchRows.find((x) => x.id === id && x.status === 'locked');
    if (m) Object.assign(m, { status: 'played', ...result });
  }

  async finishCycle(
    cycleId: string,
    at: Date,
    rows: { characterId: string; place: number; movement: 'up' | 'down' | 'stay' }[],
  ) {
    for (const r of rows) {
      const m = this.memberRows.find(
        (x) => x.cycleId === cycleId && x.characterId === r.characterId,
      );
      if (m) Object.assign(m, { place: r.place, movement: r.movement });
    }
    const c = this.cycles.find((x) => x.id === cycleId);
    if (c && c.status === 'active') Object.assign(c, { status: 'finished', finishedAt: at });
  }

  async memberships(characterId: string, limit: number) {
    return this.memberRows
      .filter((m) => m.characterId === characterId)
      .map((m) => ({ m, n: this.cycles.find((c) => c.id === m.cycleId)!.number }))
      .sort((a, b) => b.n - a.n)
      .slice(0, limit)
      .map(({ m }) => m);
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
  admin: InMemoryAdmin;
  seasonAdmin: InMemorySeasonAdmin;
  exports: InMemoryExport;
  configs: InMemoryConfigs;
  bots: InMemoryBots;
  accountData: InMemoryAccountData;
  league: InMemoryLeague;
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
  const admin = new InMemoryAdmin(accounts, characters, sessions);
  const seasonAdmin = new InMemorySeasonAdmin(characters, fights, dungeon, guilds, inventory);
  const exportRepo = new InMemoryExport(characters, fights, dungeon, inventory);
  const configs = new InMemoryConfigs(seasons.current!.id);
  const bots = new InMemoryBots(characters);
  const accountData = new InMemoryAccountData(accounts, characters, sessions, fights);
  const league = new InMemoryLeague(characters);
  league.discord = guilds;
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
    .overrideProvider(ADMIN_REPOSITORY)
    .useValue(admin)
    .overrideProvider(ADMIN_EXPORT_REPOSITORY)
    .useValue(exportRepo)
    .overrideProvider(SEASON_ADMIN_REPOSITORY)
    .useValue(seasonAdmin)
    .overrideProvider(CONFIG_REPOSITORY)
    .useValue(configs)
    .overrideProvider(BOT_REPOSITORY)
    .useValue(bots)
    .overrideProvider(ACCOUNT_DATA_REPOSITORY)
    .useValue(accountData)
    .overrideProvider(LEAGUE_REPOSITORY)
    .useValue(league)
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
    admin,
    seasonAdmin,
    exports: exportRepo,
    configs,
    bots,
    accountData,
    league,
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
