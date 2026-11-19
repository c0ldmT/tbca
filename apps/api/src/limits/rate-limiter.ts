import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Valkey } from 'iovalkey';

import type { Env } from '../config/env.js';
import { ENV, RATE_LIMITER } from '../tokens.js';

/**
 * Kurzlebige Zustände für Anti-Abuse (Spezifikation, Abschnitt 11): zentral in Valkey, damit
 * mehrere Prozesse dieselben Cooldowns sehen. Nichts davon ist dauerhaft.
 */
export interface RateLimiter {
  /** true, wenn der Schlüssel frei war und jetzt für `ttlMs` belegt ist (Cooldown, Idempotenz). */
  acquire(key: string, ttlMs: number): Promise<boolean>;
  /** Setzt `value` und liefert den vorherigen Wert (z. B. Hash der letzten Nachricht). */
  swap(key: string, value: string, ttlMs: number): Promise<string | null>;
}

export class ValkeyRateLimiter implements RateLimiter, OnApplicationShutdown {
  constructor(private readonly client: Valkey) {}

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    return (await this.client.set(key, '1', 'PX', ttlMs, 'NX')) === 'OK';
  }

  async swap(key: string, value: string, ttlMs: number): Promise<string | null> {
    const previous = await this.client.getset(key, value);
    await this.client.pexpire(key, ttlMs);
    return previous;
  }

  async onApplicationShutdown(): Promise<void> {
    this.client.disconnect();
  }
}

/** Für Tests und Einzelprozess-Betrieb ohne Valkey. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly entries = new Map<string, { value: string; until: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    const current = this.entries.get(key);
    if (current && current.until > this.now()) return false;
    this.entries.set(key, { value: '1', until: this.now() + ttlMs });
    return true;
  }

  async swap(key: string, value: string, ttlMs: number): Promise<string | null> {
    const current = this.entries.get(key);
    this.entries.set(key, { value, until: this.now() + ttlMs });
    return current && current.until > this.now() ? current.value : null;
  }
}

@Global()
@Module({
  providers: [
    {
      provide: RATE_LIMITER,
      inject: [ENV],
      useFactory: (env: Env) =>
        new ValkeyRateLimiter(
          new Valkey(env.VALKEY_URL, { lazyConnect: true, maxRetriesPerRequest: 2 }),
        ),
    },
  ],
  exports: [RATE_LIMITER],
})
export class RateLimitModule {}
