import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { Env } from '../config/env.js';
import { ENV, SESSION_STORE } from '../tokens.js';
import type { SessionStore, StoredSession } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Gültigkeit wird höchstens einmal pro Tag verlängert, um Schreibzugriffe zu sparen. */
const EXTEND_AFTER_MS = DAY_MS;
const MAX_TOKEN_LENGTH = 128;

export interface NewSession {
  token: string;
  csrfToken: string;
  maxAgeSeconds: number;
}

/**
 * Server-Sessions (Spezifikation, Abschnitt 17). Das zufällige Token steht nur im
 * httpOnly-Cookie; gespeichert wird sein SHA-256-Hash. Sessions laufen nach
 * SESSION_TTL_DAYS ohne Nutzung ab (gleitende Gültigkeit).
 *
 * Sessions nutzen die Echtzeit, nicht die Spieluhr: Ein Zeitfaktor in einer
 * Test-Season soll niemanden ausloggen.
 */
@Injectable()
export class SessionService {
  private readonly ttlMs: number;

  constructor(
    @Inject(SESSION_STORE) private readonly store: SessionStore,
    @Inject(ENV) env: Env,
  ) {
    this.ttlMs = env.SESSION_TTL_DAYS * DAY_MS;
  }

  get maxAgeSeconds(): number {
    return this.ttlMs / 1000;
  }

  async create(accountId: string, now = new Date()): Promise<NewSession> {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    await this.store.create({
      accountId,
      tokenHash: hashToken(token),
      csrfToken,
      expiresAt: new Date(now.getTime() + this.ttlMs),
      now,
    });
    return { token, csrfToken, maxAgeSeconds: this.maxAgeSeconds };
  }

  async resolve(token: string | undefined, now = new Date()): Promise<StoredSession | null> {
    if (!token || token.length > MAX_TOKEN_LENGTH) return null;
    const found = await this.store.findValid(hashToken(token), now);
    if (!found) return null;
    if (now.getTime() - found.lastSeenAt.getTime() >= EXTEND_AFTER_MS) {
      const expiresAt = new Date(now.getTime() + this.ttlMs);
      await this.store.extend(found.id, now, expiresAt);
      return { ...found, lastSeenAt: now, expiresAt };
    }
    return found;
  }

  async revoke(token: string): Promise<void> {
    await this.store.delete(hashToken(token));
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
