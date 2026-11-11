/** Liest DATABASE_URL; die Scripts laden sie aus .env.<umgebung>. */
export function requireDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL ist nicht gesetzt (scripts/migrate.sh lädt sie aus .env.*)');
  }
  return url;
}
