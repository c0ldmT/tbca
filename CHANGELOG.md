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
- Charaktere: anlegen (ein Charakter pro Account und Season, Namensregeln mit Wortfilter),
  Punkte verteilen, umskillen, Klasse wechseln, Loadout und Taktikregeln je Klasse speichern;
  Spielinhalte der Season über `GET /api/game/config`.
- Datenbank: Tabelle `loadout`, freie Punkte werden abgeleitet statt gespeichert
  (Migration `0001_character_loadout`).
- Website: Charakterseite mit Erstellung, Attributen samt Vorschau der Kampfwerte, Klassenwechsel,
  Fähigkeiten-Auswahl und Taktik-Editor.
- PvP: asynchrone Herausforderungen gegen die Momentaufnahme des Gegners, gewertet oder als
  Freundschaftskampf; Belohnungsregeln (10 belohnte Kämpfe pro Tag, nichts gegen Gegner mehr als
  10 Level darunter, Underdog-Bonus, 100/50/0 % gegen denselben Gegner) und XP mit Levelaufstieg.
- Kämpfe werden mit Seed, Versionen, Momentaufnahmen und gzip-komprimiertem Event-Log gespeichert
  (Migration `0002_fights`); parallele Herausforderungen zählen dank Sperre korrekt.
- Bot-Gegner: Die Dev-Season enthält 16 computergesteuerte Charaktere (jede Klasse auf Stufe 1, 3,
  6 und 10) mit plausibler Punkteverteilung; gewertete Kämpfe gegen Bots belohnen nur in
  Test-Seasons (Migration `0003_bots_training`).
- Training: Kampf gegen einen Computer-Gegner frei wählbarer Klasse und Stufe, ohne Belohnung,
  mit Replay – zum Testen von Punkten, Loadout und Taktik.
- Website: Arena mit Gegnersuche und letzten Kämpfen, HUD-Replay mit Lebens- und Energiebalken,
  Schadenszahlen, Status, Glitch bei Crits, Geschwindigkeit und Textlog; Replays per Link teilbar.

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

- Ältere Season-Konfigurationen werden mit den Startwerten ergänzt; sonst brach ein Kampf mit
  einer Konfiguration aus Phase 0 ab (fehlender `triangleBonus`).

- `scripts/dev.sh` spielt nach den Migrationen die Entwicklungsdaten ein; ohne aktive Season
  antwortete `/api/game/config` mit 503. Die Charakterseite zeigt dafür jetzt eine verständliche
  Meldung statt eines allgemeinen Fehlers.

- Entwicklungsdienste nutzen die Ports 55432 (Postgres) und 56379 (Valkey), damit lokal
  installierte Dienste nicht kollidieren. `scripts/dev.sh` meldet belegte Ports vorab verständlich.
- `DATABASE_URL` und `VALKEY_URL` werden aus den `POSTGRES_*`- bzw. `VALKEY_PORT`-Werten
  abgeleitet, wenn sie leer sind; Port und Passwort stehen damit nur an einer Stelle.
- `scripts/setup.sh` installiert pnpm mit erlaubtem Install-Script neu, wenn es nur über Node.js
  statt als natives Binary läuft.

### Sicherheit

- `vite` per Override auf 8.3.5 angehoben (Lücke in `launch-editor` bis 8.3.2).
