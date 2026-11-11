import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema.js';

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;

export interface DbConnection {
  db: Database;
  pool: pg.Pool;
  /** Schließt alle Verbindungen (beim Herunterfahren). */
  close(): Promise<void>;
}

export interface CreateDbOptions {
  /** Maximale Verbindungen im Pool; auf kleiner Hardware (Raspberry Pi) niedrig halten. */
  maxConnections?: number;
  applicationName?: string;
}

export function createDb(url: string, options: CreateDbOptions = {}): DbConnection {
  const pool = new pg.Pool({
    connectionString: url,
    max: options.maxConnections ?? 10,
    application_name: options.applicationName ?? 'tbca',
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

/** Prüft die Verbindung, z. B. für den Healthcheck. */
export async function pingDb(pool: pg.Pool): Promise<void> {
  await pool.query('SELECT 1');
}
