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
- Credits: Ledger mit doppelter Buchführung (Buchungen summieren sich zu 0, Systemkonten als
  Quellen und Senken) und Saldo je Spieler, der nie negativ wird (Migration `0004_credits`).
  Gewertete Kämpfe bringen Credits, Umskillen kostet Level × 10 Credits.
- Items: Power-Budget aus Slot, Item-Level und Rarität (1 + 0,35 · ln R als Tabelle), 14 Vorlagen
  aus dem Startset, Affixe nach Tier mit 70–100 % ihres Budgetanteils, Einhand, Zweihand, Schild
  und Beidhändigkeit; Ausrüstung wirkt auf Attribute, Kampfwerte und den Angriff
  (Migration `0005_items`).
- Startausrüstung (Klassenwaffe und Weste) für neue und bestehende Charaktere; in Test-Seasons
  lässt sich Test-Beute würfeln.
- Website: Ausrüstung und Inventar auf der Charakterseite mit Sternen in Tierfarbe, Basiswerten,
  Affixen und Vorschau der Kampfwerte inklusive Ausrüstung.
- Crafting: Zerlegen in Materialien (Schrott, Schaltkreise, Quantenkerne) nach Tier und Level,
  Aufwerten +0 bis +10 (+3 % je Stufe, ab +6 mit Fehlschlag-Chance, Items werden nie zerstört),
  Affix-Übertragung mit sinkender Erfolgschance und Neu würfeln eines Affixes.
- Shop: Verbrauchsgüter (Heil-Injektor, Backup-Chip), tägliche Ausrüstungs-Rotation je Spieler auf
  dem eigenen Level und Verkauf an den Shop für 20 % des Werts. Credits, Materialien und Items werden
  gemeinsam gebucht – alles oder nichts (Migration `0006_crafting_shop`).
- Website: Werkbank auf der Charakterseite mit Kosten und Chancen vorab, Materialanzeige und
  Shop-Seite.
- Dungeon: endlose Etagen (Etage 1 knapp unter dem Charakterlevel, +1 Monster-Level je Etage),
  Boss-Etagen alle 5 Ebenen mit doppeltem, garantiert besserem Loot, Modifikatoren ab Etage 10,
  mehr Gegner in der Tiefe, Rarität steigt mit der Tiefe. HP und Energie bleiben zwischen den
  Etagen erhalten (+10 %), Heil-Injektoren heilen, der Backup-Chip rettet den Run-Loot bei einer
  Niederlage. 3 Runs pro Tag gegen Eintritt; nach 10 Minuten ohne Entscheidung automatischer Ausstieg
  mit Loot (Migration `0007_dungeon`).
- Engine: Kämpfer können mit gespeichertem Zustand (HP, Energie) starten; Überlebende melden ihre
  Energie. Bestehende Replays bleiben unverändert.
- Website: Dungeon-Seite mit Vorschau der nächsten Etage, Vitalwerten, Run-Loot und Entscheidung;
  Monsternamen im Replay übersetzt.
- Discord-Bot (`apps/bot-discord`): `/tbca registrieren` (Schatten-Account, den ein späterer
  Web-Login übernimmt), `/tbca profil`, `/tbca kampf` mit Zusammenfassung und Replay-Link,
  `/tbca-admin einrichten` und `/tbca-admin xp-kanal` für Community-Admins.
- Aktivitäts-XP für Discord-Nachrichten: 15–25 XP ab 5 Zeichen, nur in freigegebenen Kanälen,
  60 s Cooldown und Wiederholungsprüfung je Identität in Valkey, Ereignis-ID gegen Doppelverarbeitung,
  globales passives Tageslimit je Account (voll, dann 50 %, dann Schluss). Der Bot sendet nur Länge
  und Hash, nie den Inhalt (Migration `0008_passive_xp`).
- Interne API für Bots mit Service-Token; Community-Mitgliedschaft mit Heimat-Community entsteht
  automatisch.
- Teams: feste Gruppen mit Name, Kürzel und Logo, bis zu 6 Mitglieder, gebunden an eine Community
  (je Community ein Team pro Account); Beitritt per Code, Kapitän mit Übergabe beim Austritt.
  Team-Herausforderungen 2v2 und 3v3 gegen die Standard-Aufstellung des Gegners, mit Team-Taktik
  (Fokusziel) und denselben Belohnungsregeln wie im Einzel für jedes Mitglied der Aufstellung
  (Migration `0009_teams`). Communities lassen sich auf der Website beitreten.
- Dev-Daten: zwei Bot-Teams mit je vier Bots (Beitrittscodes `BOTCHW`, `BOTNEON`).
- Website: Teams-Seite mit Gründen, Beitreten, Aufstellung, Fokusziel und Herausforderung; Replays
  zeigen die Belohnungen aller Team-Mitglieder.
- Betrieb: Produktions-Images (Server mit API, Bot und kombiniertem Prozess; Website mit Caddy),
  plattformübergreifend für amd64 und arm64, nur mit Laufzeit-Abhängigkeiten und ohne Root.
  `docker-compose.prod.yml` mit den Profilen `standard` (VPS) und `compact` (Raspberry Pi 3).
- Caddy mit automatischem HTTPS, strenger Content-Security-Policy, HSTS und Caching-Regeln.
- Scripts `build.sh`, `deploy.sh` (Backup, Migration, Healthcheck, automatischer Rollback) und
  `backup.sh` (sichern, auflisten, wiederherstellen); Anleitung in `docs/deployment.md`.
- `apps/server` startet API und Discord-Bot in einem Prozess (`TBCA_SERVICES`).
- Rate-Limits je Session bzw. IP mit Zählern in Valkey, strenger für den Login; Healthchecks und die
  Bot-API sind ausgenommen.
- Website: Produktions-Build ohne Inline-Skript, damit die strenge CSP greift.
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

- XP-Kanäle: Ein Kanal, der den Server wechselt, wird der neuen Community zugeordnet.

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
