import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  // Nur für `drizzle-kit studio`/`push`; `generate` braucht keine Verbindung.
  ...(process.env['DATABASE_URL'] ? { dbCredentials: { url: process.env['DATABASE_URL'] } } : {}),
  strict: true,
  verbose: true,
});
