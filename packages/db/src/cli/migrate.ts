import { createDb } from '../client.js';
import { runMigrations } from '../migrate.js';
import { requireDatabaseUrl } from './env.js';

const { db, close } = createDb(requireDatabaseUrl(), {
  maxConnections: 1,
  applicationName: 'tbca-migrate',
});
try {
  await runMigrations(db);
  console.info('Migrationen sind aktuell.');
} finally {
  await close();
}
