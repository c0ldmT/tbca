import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

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
import { loadEnv, type Env } from '../src/config/env.js';
import { ACCOUNT_REPOSITORY, DB_PING, DISCORD_OAUTH, SESSION_STORE } from '../src/tokens.js';

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

export interface TestApp {
  app: NestFastifyApplication;
  accounts: InMemoryAccounts;
  sessions: InMemorySessions;
  discord: FakeDiscord;
  dbUp: { value: boolean };
}

export async function createTestApp(env: Env = testEnv()): Promise<TestApp> {
  const accounts = new InMemoryAccounts();
  const sessions = new InMemorySessions();
  const discord = new FakeDiscord();
  const dbUp = { value: true };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
    .overrideProvider(ACCOUNT_REPOSITORY)
    .useValue(accounts)
    .overrideProvider(SESSION_STORE)
    .useValue(sessions)
    .overrideProvider(DISCORD_OAUTH)
    .useValue(discord)
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
  return { app, accounts, sessions, discord, dbUp };
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
