# @tbca/db

Drizzle-Schema, SQL-Migrationen und Entwicklungsdaten für PostgreSQL.

| Befehl                          | Zweck                                          |
| ------------------------------- | ---------------------------------------------- |
| `scripts/migrate.sh`            | ausstehende Migrationen ausführen              |
| `scripts/migrate.sh generate`   | nach Schemaänderung neue Migration erzeugen    |
| `scripts/migrate.sh seed`       | Dev-Season, Konfiguration v1 und Dev-Community |
| `pnpm --filter @tbca/db studio` | Drizzle Studio (Datenbank im Browser ansehen)  |

## Konventionen

- Primärschlüssel sind UUIDv7, erzeugt in der Anwendung (unabhängig von der Postgres-Version).
- Migrationen in `drizzle/` werden nie nachträglich geändert, nur neue hinzugefügt.
- Spielbezogene Tabellen tragen `season_id`; Spielwerte liegen versioniert in `config_version`.
- Sessions speichern nur den SHA-256-Hash des Cookie-Tokens.

## Tests

Die Unit-Tests laufen ohne Datenbank. Die Integrationstests brauchen eine eigene, leere
Datenbank, deren Inhalt sie bei jedem Lauf löschen:

```bash
TBCA_TEST_DATABASE_URL=postgres://tbca:…@localhost:5432/tbca_test pnpm --filter @tbca/db test
```
