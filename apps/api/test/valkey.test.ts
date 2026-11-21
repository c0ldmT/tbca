/** Valkey-Rate-Limiter gegen einen echten Server; läuft nur mit TBCA_TEST_VALKEY_URL. */
import { Valkey } from 'iovalkey';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ValkeyRateLimiter } from '../src/limits/rate-limiter.js';

const url = process.env['TBCA_TEST_VALKEY_URL'];

describe.skipIf(!url)('ValkeyRateLimiter (Integration)', () => {
  let limiter: ValkeyRateLimiter;
  const key = `test:${Date.now()}`;

  // Erst hier verbinden: describe.skipIf führt den Rumpf auch beim Überspringen aus.
  beforeAll(() => {
    limiter = new ValkeyRateLimiter(new Valkey(url!));
  });
  afterAll(() => limiter?.onApplicationShutdown());

  it('vergibt einen Schlüssel nur einmal, bis er abläuft', async () => {
    expect(await limiter.acquire(`${key}:a`, 200)).toBe(true);
    expect(await limiter.acquire(`${key}:a`, 200)).toBe(false);
    await new Promise((r) => setTimeout(r, 250));
    expect(await limiter.acquire(`${key}:a`, 200)).toBe(true);
  });

  it('tauscht Werte und liefert den vorherigen', async () => {
    expect(await limiter.swap(`${key}:b`, 'eins', 1000)).toBeNull();
    expect(await limiter.swap(`${key}:b`, 'zwei', 1000)).toBe('eins');
  });
});
