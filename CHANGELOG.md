# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier festgehalten.
Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [Unreleased]

### Phase 1

- `@tbca/game-core`: Kampf-Engine v2 mit vier Klassen (Bruiser, Gunner, Netrunner, Medtech),
  je vier Fähigkeiten, Klassen-Passiven, Energie, Abklingzeiten, Statuseffekten, Attributs-Dreieck
  und Taktikregeln (Bedingung → Aktion → Ziel).
- Spielinhalte als Daten (`DEFAULT_GAME_CONFIG`): Stat-Formeln, Klassen, Fähigkeiten, XP-Kurve;
  grob vorkalibriert per Duell-Simulation.
- Charakter-Ableitung: Attributspunkte, Freischaltung nach Level, Loadout-Prüfung,
  Umskill-Kosten, Level aus XP.
- Website: Der Testkampf nutzt die echten Klassen und zeigt Fähigkeiten und Status im Verlauf.

### Phase 0

### Hinzugefügt

- Monorepo-Gerüst mit pnpm-Workspaces, TypeScript-Basiskonfiguration, ESLint und Prettier.
- Scripts `setup.sh`, `dev.sh`, `test.sh` und `migrate.sh` sowie Docker Compose für die Entwicklung
  (Postgres 18, Valkey 8).
- `@tbca/game-core`: PRNG xoshiro128\*\*, Festkomma-Arithmetik, erstes Kampf-Gerüst (N gegen N,
  Initiative-Leiste, Sudden Death, Event-Log mit Fingerabdruck), Clock-Service mit Zeitfaktor und
  Vorspulen; Tests zum Determinismus.
- `@tbca/db`: Drizzle-Grundschema (Account, Identity, Session, Community, Character, Season,
  Config), erste Migration, Migrations-Runner und idempotenter Dev-Seed.
- `@tbca/shared`: geteilte Zod-Schemas für Healthcheck, `/auth/me` und Fehler sowie Konstanten.
- `@tbca/api`: NestJS mit Fastify, Healthcheck, Discord-OAuth-Login, Server-Sessions im
  httpOnly-Cookie, CSRF-Schutz, Sicherheits-Header und strukturierte Logs ohne personenbezogene
  Daten.
- `@tbca/assets`: Design-Tokens als CSS-Variablen und TypeScript-Konstanten inkl. Rarität-Tiers;
  Test auf Übereinstimmung und WCAG-AA-Kontrast.
- `@tbca/web`: Angular-Shell (zoneless) mit Design-Tokens, Routing, Transloco (DE/EN), Discord-Login,
  Glitch-Effekt und einem Testkampf, den die Engine direkt im Browser berechnet.

### Behoben

- Entwicklungsdienste nutzen die Ports 55432 (Postgres) und 56379 (Valkey), damit lokal
  installierte Dienste nicht kollidieren. `scripts/dev.sh` meldet belegte Ports vorab verständlich.
- `DATABASE_URL` und `VALKEY_URL` werden aus den `POSTGRES_*`- bzw. `VALKEY_PORT`-Werten
  abgeleitet, wenn sie leer sind; Port und Passwort stehen damit nur an einer Stelle.
- `scripts/setup.sh` installiert pnpm mit erlaubtem Install-Script neu, wenn es nur über Node.js
  statt als natives Binary läuft.

### Sicherheit

- `vite` per Override auf 8.3.5 angehoben (Lücke in `launch-editor` bis 8.3.2).
