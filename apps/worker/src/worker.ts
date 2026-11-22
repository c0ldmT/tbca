import { Queue, Worker } from 'bullmq';
import { Valkey, type RedisOptions } from 'iovalkey';

import { JOBS, runJob } from './jobs.js';

export interface WorkerEnv {
  valkeyUrl: string;
  apiUrl: string;
  serviceToken: string | null;
  /** Name der Queue; Standard QUEUE_NAME (eigene Namen z. B. für Tests). */
  queueName?: string;
  /** HTTP-Client für die API; Standard ist fetch (Tests ersetzen ihn). */
  fetchFn?: typeof fetch;
}

export function loadWorkerEnv(env: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return {
    valkeyUrl: env['VALKEY_URL'] || 'redis://localhost:6379',
    apiUrl: (env['API_INTERNAL_URL'] || 'http://127.0.0.1:3000/api').replace(/\/+$/, ''),
    serviceToken: env['BOT_SERVICE_TOKEN'] || null,
  };
}

/** Verbindungsdaten aus VALKEY_URL (redis://[user:pass@]host:port[/db]). */
export function connectionFrom(url: string): RedisOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.pathname.length > 1 ? { db: Number(u.pathname.slice(1)) } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    // BullMQ verlangt das für blockierende Befehle.
    maxRetriesPerRequest: null,
  };
}

export const QUEUE_NAME = 'tbca-maintenance';

/** Startet Planer und Verarbeitung; liefert null ohne Service-Token. */
export async function startWorker(
  env: WorkerEnv = loadWorkerEnv(),
): Promise<{ close(): Promise<void> } | null> {
  if (!env.serviceToken) {
    console.warn('Worker nicht gestartet: BOT_SERVICE_TOKEN in .env setzen.');
    return null;
  }
  // BullMQ bekommt fertige Clients (iovalkey ist API-kompatibel zu ioredis).
  const options = connectionFrom(env.valkeyUrl);
  const queueClient = new Valkey(options);
  const workerClient = new Valkey(options);
  const queueName = env.queueName ?? QUEUE_NAME;
  const queue = new Queue(queueName, { connection: queueClient as never });
  for (const job of JOBS) {
    // Idempotent: mehrere Worker teilen sich denselben Planer.
    await queue.upsertJobScheduler(job.name, { every: job.everyMs }, { name: job.name });
  }
  const api = { url: env.apiUrl, token: env.serviceToken };
  const worker = new Worker(
    queueName,
    async (bullJob) => {
      const job = JOBS.find((j) => j.name === bullJob.name);
      if (!job) throw new Error(`Unbekannter Job: ${bullJob.name}`);
      return runJob(job, api, env.fetchFn ?? fetch);
    },
    {
      connection: workerClient as never,
      concurrency: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  );
  worker.on('failed', (job, error) =>
    console.warn(`Job ${job?.name ?? '?'} fehlgeschlagen: ${error.message}`),
  );
  console.info(`Worker läuft: ${JOBS.map((j) => j.name).join(', ')}`);
  return {
    close: async () => {
      await worker.close();
      await queue.close();
      queueClient.disconnect();
      workerClient.disconnect();
    },
  };
}
