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
  /** Legt einen kurzlebigen Wert ab (z. B. berechnete Season-Kennzahlen). */
  remember(key: string, value: string, ttlMs: number): Promise<void>;
  /** Liest einen mit `remember` abgelegten Wert; null, wenn keiner (mehr) da ist. */
  recall(key: string): Promise<string | null>;
  /** Hängt einen Eintrag an eine Warteschlange an (z. B. vorgemerkte XP). */
  enqueue(key: string, value: string): Promise<void>;
  /** Nimmt bis zu `max` Einträge vom Anfang der Warteschlange. */
  drain(key: string, max: number): Promise<string[]>;
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

  async remember(key: string, value: string, ttlMs: number): Promise<void> {
    await this.client.set(key, value, 'PX', ttlMs);
  }

  recall(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async enqueue(key: string, value: string): Promise<void> {
    await this.client.rpush(key, value);
  }

  async drain(key: string, max: number): Promise<string[]> {
    return (await this.client.lpop(key, max)) ?? [];
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

  async remember(key: string, value: string, ttlMs: number): Promise<void> {
    this.entries.set(key, { value, until: this.now() + ttlMs });
  }

  async recall(key: string): Promise<string | null> {
    const current = this.entries.get(key);
    return current && current.until > this.now() ? current.value : null;
  }

  private readonly queues = new Map<string, string[]>();

  async enqueue(key: string, value: string): Promise<void> {
    this.queues.set(key, [...(this.queues.get(key) ?? []), value]);
  }

  async drain(key: string, max: number): Promise<string[]> {
    const queue = this.queues.get(key) ?? [];
    this.queues.set(key, queue.slice(max));
    return queue.slice(0, max);
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
