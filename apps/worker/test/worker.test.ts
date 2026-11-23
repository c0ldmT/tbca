import { describe, expect, it, vi } from 'vitest';

import { JOBS, runJob } from '../src/jobs.js';
import { connectionFrom, startWorker } from '../src/worker.js';

describe('Worker', () => {
  it('ruft für jeden Job den internen Endpunkt mit Service-Token auf', async () => {
    const fetchFn = vi.fn(async () => new Response('{"expired":2}', { status: 200 }));
    const result = await runJob(
      JOBS[0]!,
      { url: 'http://api/api', token: 't'.repeat(40) },
      fetchFn as unknown as typeof fetch,
    );
    expect(result).toEqual({ expired: 2 });
    expect(fetchFn).toHaveBeenCalledWith(
      'http://api/api/internal/jobs/expire-dungeon-runs',
      expect.objectContaining({
        method: 'POST',
        headers: { authorization: `Bearer ${'t'.repeat(40)}` },
      }),
    );
  });

  it('meldet Fehler der API, damit BullMQ den Job als fehlgeschlagen führt', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 503 }));
    await expect(
      runJob(JOBS[1]!, { url: 'http://api', token: 'x' }, fetchFn as unknown as typeof fetch),
    ).rejects.toThrow(/503/);
  });

  it('liest Verbindungsdaten aus VALKEY_URL', () => {
    expect(connectionFrom('redis://:geheim@valkey:6380/2')).toMatchObject({
      host: 'valkey',
      port: 6380,
      password: 'geheim',
      db: 2,
    });
    expect(connectionFrom('redis://localhost:6379')).not.toHaveProperty('password');
  });

  it('startet ohne Service-Token nicht', async () => {
    expect(
      await startWorker({
        valkeyUrl: 'redis://localhost:1',
        apiUrl: 'http://x',
        serviceToken: null,
      }),
    ).toBeNull();
  });
});

const url = process.env['TBCA_TEST_VALKEY_URL'];
describe.skipIf(!url)('Worker (Integration mit Valkey)', () => {
  it('plant die Jobs und führt sie sofort aus', { timeout: 15_000 }, async () => {
    const calls: string[] = [];
    const fetchFn = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const worker = await startWorker({
      valkeyUrl: url!,
      apiUrl: 'http://api',
      serviceToken: 't'.repeat(40),
      queueName: `tbca-test-${Date.now()}`,
      fetchFn,
    });
    try {
      await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3), { timeout: 5000 });
      expect(calls).toContain('http://api/internal/jobs/expire-dungeon-runs');
      expect(calls).toContain('http://api/internal/jobs/cleanup-sessions');
    } finally {
      await worker!.close();
    }
  });
});
