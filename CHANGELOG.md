# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier festgehalten.
Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [Unreleased]

### Hinzugefügt

- Monorepo-Gerüst mit pnpm-Workspaces, TypeScript-Basiskonfiguration, ESLint und Prettier.
- Scripts `setup.sh`, `dev.sh`, `test.sh` und `migrate.sh` sowie Docker Compose für die Entwicklung
  (Postgres 18, Valkey 8).
- `@tbca/game-core`: PRNG xoshiro128\*\*, Festkomma-Arithmetik, erstes Kampf-Gerüst (N gegen N,
  Initiative-Leiste, Sudden Death, Event-Log mit Fingerabdruck), Clock-Service mit Zeitfaktor und
  Vorspulen; Tests zum Determinismus.
