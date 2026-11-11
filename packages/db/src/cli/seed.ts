import { createDb } from '../client.js';
import { seedDevelopment } from '../seed.js';
import { requireDatabaseUrl } from './env.js';

if (process.env['NODE_ENV'] === 'production') {
  throw new Error('Seed ist nur für die Entwicklung gedacht.');
}

const { db, close } = createDb(requireDatabaseUrl(), {
  maxConnections: 1,
  applicationName: 'tbca-seed',
});
try {
  await seedDevelopment(db);
  console.info('Entwicklungsdaten eingespielt.');
} finally {
  await close();
}
