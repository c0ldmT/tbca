/**
 * Kombinierter Prozess für das Sparprofil (Spezifikation, Abschnitt 15): Statt je eines
 * Containers für API und Bots läuft alles in einem Node-Prozess. Welche Dienste starten,
 * legt TBCA_SERVICES fest (Standard: api,bot-discord). Der Bot spricht die API weiterhin über
 * HTTP an, damit die Grenzen dieselben bleiben wie im Standardprofil.
 */
import { createApiApp } from '@tbca/api/app';
import { loadEnv } from '@tbca/api/env';
import { startBot } from '@tbca/bot-discord/bot';

const services = new Set(
  (process.env['TBCA_SERVICES'] ?? 'api,bot-discord')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const stoppers: (() => Promise<unknown>)[] = [];

if (services.has('api')) {
  const env = loadEnv();
  const app = await createApiApp(env);
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  stoppers.push(() => app.close());
}

if (services.has('bot-discord')) {
  const client = await startBot();
  if (client) stoppers.push(() => client.destroy());
}

console.info(`TBCA läuft: ${[...services].join(', ')}`);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void Promise.allSettled(stoppers.map((stop) => stop())).then(() => process.exit(0));
  });
}
