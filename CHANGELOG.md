# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier festgehalten.
Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [Unreleased]

### Hinzugefügt

- Liga im Discord-Bot: `/tbca liga` zeigt Rating, Platzierung, Division und nächsten Spieltag
  mit Buttons für Platzierungskampf und An-/Abmelden. `/tbca-admin liga-kanal` legt einen
  Kanal für Ankündigungen fest (einer je Server): Der Bot holt jede Minute neue Ergebnisse ab
  (`POST /api/internal/discord/league-news`) und meldet gespielte Spieltage und das Zyklusende
  mit Platz und Auf-/Abstieg – nur für Spieler mit Heimat in der Community des Servers.
  Migration 0015 (`community_channel.league_news`, `league_announced_until`).
- Liga: jede Division des laufenden (oder zuletzt beendeten) Zyklus ist einsehbar
  (`GET /api/league/divisions/:index`); auf der Liga-Seite blättern Pfeile durch die
  Divisionen, ohne eigene Teilnahme zeigt sie die oberste.
- Liga (Phase 2, Spezifikation Abschnitt 9): Glicko-2-Rating aus allen gewerteten Kämpfen
  (Herausforderungen und Liga, beide Seiten, auch Bot-Spieler), Platzierung über die ersten
  5 gewerteten Kämpfe (eigener Knopf „Platzierungskampf“ mit automatisch gewähltem Gegner),
  Anmeldung für kommende Zyklen. Ein Zyklus teilt die Angemeldeten in Divisionen (Ziel 8,
  höchstens 10; Bisherige behalten ihre Division, je 2 Auf- und Absteiger, Neue nach Rating)
  und spielt Round Robin mit einem Spieltag pro Tag um 20:00 Uhr in der Spielzeitzone. Eine
  Stunde vorher werden Ausrüstung, Klasse und Taktik eingefroren (Lock), zum Spieltag wird
  gekämpft (Sieg 3, Unentschieden 1, Niederlage 0; XP und Credits wie bei einer gewerteten
  Herausforderung, ohne das Tageslimit zu belasten). Tabelle mit Siegen und direktem Vergleich
  als Tiebreak, Rangliste global oder nach Heimat-Community. Der Worker-Job `league-tick`
  (jede Minute, auch als Admin-Job) arbeitet alle fälligen Termine nach Spielzeit in
  Reihenfolge ab – nach dem Vorspulen einer Test-Season Spieltag für Spieltag und Zyklus für
  Zyklus. Regeln in der Konfiguration (`league`), Migration 0014 (`rating`, `league_cycle`,
  `league_member`, `league_match`, Kampfart `league`). Website: Tab „Liga“ im Kampf-Hub.
  Bots mit Agent melden sich in Test-Seasons an. Das Zurücksetzen einer Season löscht Liga und
  Ratings mit.
- Bot-Gegner tragen Ausrüstung: Für jeden leeren Platz bekommen Bot-Spieler ein Item passend zu
  Klasse und Level, fest je Bot und Level (PvP, Team-Kämpfe, Dungeon). Trainingsgegner tragen
  dieselbe Ausrüstung. Die Rarität je Level-Stufe steht in der Konfiguration (`pvp.botGear`;
  Vorkalibrierung ★2 ab L1, ★3 ab L10, ★5 ab L30, ★7 ab L50, ★9 ab L80 – etwas unter den
  Balancing-Profilen). Gespeicherte Versionen erhalten das Feld automatisch.
- Team-Simulation für 2v2 und 3v3 (`simulateTeams` in game-core): Jede Aufstellung der vier
  Klassen (Doppelungen erlaubt; 10 bzw. 20 Aufstellungen) kämpft gegen jede andere, je zur
  Hälfte als erstes und zweites Team. Ergebnis: Rangliste mit schwerstem Gegner, Beitrag je
  Klasse, gemischte gegen doppelte Aufstellungen. In der Admin-Simulation als dritte Auswertung
  (höchstens 60 Kämpfe je Paarung) und im Balancing-Report (`teamFights`, Standard 8; 0 lässt
  die Teams weg), jeweils mit CSV-Export.
- Admin, Season-Steuerung (`/admin/season`): Kennzahlen des Spieltags, Tageslimits für alle
  oder einen Spieler zurücksetzen (Dungeon-Runs, belohnte Kämpfe, Chat-XP-Deckel), Hintergrund-
  Jobs sofort ausführen (Season-Kennzahlen, Chat-XP buchen, verwaiste Runs abschließen, alle
  Runs beenden, Bots handeln lassen), Season-Ende verschieben und die Season zurücksetzen
  (Fortschritt oder alles; Bestätigung mit dem Season-Slug). Rücksetzungen der Tageslimits
  löschen nichts, sondern stehen in der neuen Tabelle `daily_reset` (Migration 0012); alles
  landet im Audit-Log.
- Entwicklung im Heimnetz: `scripts/dev.sh lan` macht den Dev-Server im LAN erreichbar, ermittelt
  die Adresse (oder `TBCA_LAN_HOST`), trägt sie als `WEB_EXTRA_ORIGINS` ein und zeigt die
  Discord-Redirects, Firewall- und WSL2-Hinweise an. Der Discord-Login springt an die Adresse
  zurück, über die er gestartet wurde. Optionaler Testzugang ohne Discord per Name
  (`DEV_LOGIN=true`, Anbieter `dev`, Migration 0013; in Produktion verweigert die API den Start).
- Balancing-Exporte: Simulationsergebnis als JSON oder CSV, Balancing-Report über Level 3–80
  mit vollständiger Konfiguration (`POST /api/admin/simulations/report`, `tbca-sim-report/v1`)
  und anonymisierter Datenexport der Plattform (`GET /api/admin/export`, `tbca-data/v1`:
  Builds, Kämpfe mit den Werten aller Beteiligten, Dungeon-Runs, Wirtschaft, Chat-XP – ohne
  Namen und IDs, Kürzel je Export neu).
- Item-Editor überarbeitet: Namen je Sprache (DE/EN) in der Konfiguration, die ID folgt bei
  neuen Vorlagen dem Namen und bleibt bei veröffentlichten fest; Suche, Kategorie-Filter, Icons,
  lesbare Bezeichnungen, Basisgewichte mit Anteil, Waffen-Skalierung als Schaden je Punkt,
  Duplizieren. Neu: Abgleich jeder Vorlage mit der Balancing-Kurve, Item-Generator nach Stil
  (z. B. Bollwerk, Schütze, Hacker) mit Namen und an der Kurve ausgerichteten Werten,
  Export/Import der Item-Werte im normierten Format `tbca-items/v1` mit Vorschau der
  Änderungen, Entwurf aus den Startwerten des Codes (`from: "defaults"`).
- Website: Item-Namen kommen aus der Konfiguration, sonst aus der Übersetzung, sonst aus der
  lesbar gemachten ID (vorher erschien bei neuen Vorlagen der Übersetzungsschlüssel).
- Balancing-Simulation (Phase 2, Spezifikation Abschnitt 14): `simulateMatchups` (Gewinnraten-
  Matrix Klasse × Klasse mit Ausreißern, beide Startpositionen) und `simulateDungeon`
  (Verteilung der erreichten Tiefe) in game-core, rein und deterministisch. Admin-Endpunkt
  `POST /api/admin/simulations` gegen eine Konfigurationsversion und Admin-Seite
  `/admin/simulation` mit Heatmap, Histogramm und Vergleich Entwurf ↔ veröffentlichte Version.
  Simuliert werden typische Bot-Builds mit Ausrüstung nach Profil (keine, ★3, ★7, ★11).
- Admin: Shop-Editor (`/admin/shop`) als Formular für Verbrauchsgüter mit Preisen,
  Tagesrotation, Verkaufsanteil und Umbenennen; arbeitet auf dem Konfigurationsentwurf mit
  Speichern und Veröffentlichen. Die Konfigurationsprüfung kennt jetzt auch die Shop-Werte.
- Discord-Bot: `/tbca dungeon` zeigt den Run mit Buttons (Run starten, Weiter, Mit Loot raus,
  Heil-Injektor); nur der Besitzer kann entscheiden, Start-Optionen `injektoren` und
  `backup-chip`. Der Loot bleibt bis zum Ausstieg versiegelt. `/tbca team` listet die eigenen
  Teams, `/tbca team-kampf gegner:<Kürzel> groesse:2|3` fordert mit der gespeicherten
  Standard-Aufstellung heraus. Interne Endpunkte `POST /api/internal/discord/dungeon`,
  `GET /api/internal/discord/teams`, `POST /api/internal/discord/team-challenge`. Neue Commands
  einmal mit `scripts/bot.sh register-commands` registrieren.
- XP-Bündelung (Spezifikation, Abschnitt 15): Aktivitäts-XP aus dem Chat werden nach allen
  Prüfungen in Valkey vorgemerkt und vom Worker alle 30 Sekunden gebündelt gebucht – eine
  Transaktion je Account und Tag statt je Nachricht (`POST /api/internal/jobs/flush-passive-xp`).
  Die interne Aktivitäts-Antwort meldet `queued` statt `awarded`; ist das gebuchte Tageslimit
  schon erreicht, wird nichts mehr vorgemerkt.
- Aufholbonus (Spezifikation, Abschnitt 11): Charaktere mehr als 5 Level unter dem Median der
  Season bekommen +50 % XP aus Kämpfen, Team-Kämpfen und Dungeon (Konfiguration `catchUp`).
  Der Worker frischt den Median alle 10 Minuten auf (`POST /api/internal/jobs/season-stats`,
  Ablage in Valkey); passive XP bleiben unverändert gedeckelt.
- Website, Design „Hologramm“: halbtransparente Glas-Panels mit Cyan-Kante und abgeschrägter
  HUD-Ecke, Scanlines und seltene, kurze Glitch-Verzerrungen (je Fläche eigene Periode,
  bei `prefers-reduced-motion` und Grafikstufe „Niedrig“ aus). Balken und Zähler sind abgekantete
  Parallelogramme, Zähler wie „Belohnte Kämpfe“ und „Dungeon-Runs“ schräge Segmente.
- Website: Hintergrund als ruhige Cyberpunk-Stadt im Regen (Canvas 2D) mit sichtbaren Aufschlägen
  am Boden; Grafikstufen Auto/Hoch/Mittel/Niedrig (Niedrig zeigt ein Standbild).
- Website: Navigation in vier Hubs mit Tabs – Charakter (Ausrüstung, Werkstatt, Fähigkeiten &
  Taktik, Attribute & Klasse), Kampf (Arena, Dungeon, Training, Verlauf), Crew (Mein Team,
  Team-Kampf, Communities), Markt (Shop). Kopfleiste mit Credits und Dungeon-Runs, Profil-Menü mit
  Konto, Sprache, Grafik, Sound, Admin und Abmelden; mobil eine Bottom-Bar. Alte Pfade (`/pvp`,
  `/dungeon`, `/teams`, `/shop`) leiten weiter.
- Charakter-Editor in zwei Spalten: Slots rund um eine Klassen-Silhouette, Item-Details mit
  Affix-Qualität, Vergleich und Aufwertungsstufe, Inventar mit Filtern und Sortierung. Items lassen
  sich per Drag & Drop (Maus/Stift) in Slots ziehen, auf Touch und Tastatur per Auswahl und Tippen
  auf einen markierten Slot. Kampfwerte zeigen beim Ziehen die Veränderung.
- Werkstatt als eigener Tab (aus jedem Item-Detail erreichbar): Aufwerten, Neu würfeln, Affix
  übertragen und Mehrfach-Zerlegen mit Chancen und Kosten aus der Season-Konfiguration.
- `@tbca/assets`: prozedurale Item-Icons je Vorlage und Kategorie, Leiterbahn-Muster je Item,
  Silhouetten je Klasse (Bruiser, Gunner, Netrunner, Medtech) samt Slot-Punkten, Team-Embleme und
  Teamfarben aus dem Kürzel.
- Website: Loot-Reveal nach dem Dungeon mit Effekten je Tier, Kampf-HUD für Replays (Zugreihenfolge,
  HP- und Energiebalken, Status, Schadenszahlen, Abklingzeiten, Schritt vor/zurück), neue
  Charaktererstellung mit Klassenbühne, neu gestaltete Seiten für Arena, Dungeon, Training,
  Verlauf, Crew, Shop, Konto und Startseite.
- Website: prozedurale UI-Klänge über die Web-Audio-API (ohne Audiodateien), im Profil-Menü
  abschaltbar. Grafikstufe und Sound gelten je Gerät.
- Website: Seitenübergänge auf dem echten DOM (ohne View Transitions). Beim Hub-Wechsel gleitet
  die Hub-Markierung, ein Scan-Strahl läuft über den Inhalt, die Karten materialisieren gestaffelt
  und der Titel glitcht kurz; beim Tab-Wechsel gleitet die Leuchtlinie und die Karten schieben
  sich aus der Tab-Richtung herein. Die Animationen enden exakt im fertigen Zustand. Bei
  reduzierter Bewegung und Grafikstufe „Niedrig“ ohne Animation.
- Website: Diagnose des Hintergrunds im Profil-Menü und im Konto (läuft/steht, Bilder pro
  Sekunde, Zeichenzeit, automatisch gesenkte Stufe, Grund für ein Standbild, Kontextverluste).
- Website: Klang-Engine mit Hall, Filtern, Stereo und Kompressor; leise Klänge für Schaltflächen,
  Umschalter, Auswahl, Tab- und Hub-Wechsel sowie Menü öffnen/schließen.
- `legal.json` kennt den Modus `private` für Instanzen in einem geschlossenen Kreis: kein Impressum
  (Link entfällt, `/impressum` leitet zur Datenschutzerklärung), kein Hinweis auf fehlende
  Betreiberangaben; die Datenschutzerklärung bleibt mit einem Hinweis auf die private Instanz.

### Geändert

- Medtech-Fähigkeit „Stimulans“ wirkt auf das ganze Team (neues Fähigkeitsziel `all_allies`):
  säubert, heilt 15 + 0,4 je INT und gibt 2 Züge +15 % Schaden; die Standard-Taktik setzt sie
  zuerst, sobald mindestens zwei Gegner da sind. Hebt den Medtech im 3v3 auf Level 10–50 von
  38–42 % auf 45–49 %, Duelle bleiben unverändert. Referenz-Fingerabdruck Team `6721e90a`
  (Duell und Web-Demo unverändert, Engine-Version bleibt 2). Gespeicherte Taktiken von Spielern
  bleiben, wie sie sind.
- Zweite Balancing-Runde (Vorkalibrierung aus der Simulation, noch ohne Spielerdaten):
  Medtech heilt mit „Flicken“ auf niedrigem Level weniger (Grundwert 12 → 10), Schwerer Schlag
  220 %, Verschanzen 1,4 je KON, Doppelschuss 2 × 87,5 %. Neue Regel `dungeon.healingPermille`:
  eigene Heilung wirkt im Dungeon zu 60 % (der Medtech lief sonst doppelt so tief). Item-
  Vorlagen näher an der Kurve: Schlagwaffe 0,925 statt 1,0 Schaden je STR, Injektor 0,9 statt
  0,8 je INT. Medtech auf Level 1 im Duell 74 → 56 %, im Dungeon auf Level 80 Ø 32 → 24
  Etagen. Zahlen und offene Punkte in `docs/balancing.md`. Referenz-Fingerabdrücke neu
  gesetzt (Duell `53cba225`, Team `ad265af0`, Web-Demo `d2c05cca`); die Kampflogik ist
  unverändert. Wirkt auf eine laufende Season erst über „Entwurf aus Startwerten“ – bis auf
  `healingPermille`, das gespeicherte Versionen als neues Feld sofort mit 60 % erhalten.
- Balancing, erste Angleichung der Klassen (Details und Zahlen in `docs/balancing.md`): GES gibt
  deutlich weniger Initiative, Genauigkeit, Ausweichen und Crit-Chance, dafür wachsen diese
  Werte mit dem Level; STR gibt Firewall; Schwerer Schlag 210 %, Doppelschuss 2 × 85 %, Pistole
  0,875 je GES, Netrunner-Durchdringung 25 %/25 %, Medtech-Flicken mit Grundwert 12. Die
  Standard-Taktiken nutzen jetzt alle Startfähigkeiten (Spott und Flächenangriffe erst ab zwei
  Gegnern). Gesamt-Siegquoten liegen ab Level 3 zwischen 38 und 58 % statt 13 bis 100 %.
  Gilt für neue Seasons; für die laufende Season einen Entwurf aus den Startwerten anlegen und
  veröffentlichen. Die Referenz-Fingerabdrücke der Kampf-Tests sind entsprechend neu gesetzt
  (Engine unverändert, gespeicherte Kämpfe bleiben gültig).
- Dungeon: Nach „Weiter“ läuft der Kampf der Etage im Kampf-HUD (Tempo 2×, überspringbar); das
  Ergebnis der Etage erscheint erst danach.
- Dungeon: Der Run-Loot ist bis zum Ausstieg versiegelt. Die API liefert während des Runs nur die
  Zahl der Funde (`loot.sealed`, `loot.count`), die Website zeigt verschlossene Kapseln mit
  „+1 Fund“; Items und Credits zeigt erst der Loot-Reveal.
- Website: Die Komponenten `EquipmentPanel`, `Workbench` und `ItemCard` sind durch Ausrüstungs- und
  Werkstatt-Tab ersetzt. Kampfdaten im Verlauf folgen der eingestellten Sprache.
- Website: Die Grafikstufe „Auto“ startet auf „Hoch“ und senkt erst nach gemessener Zeichenzeit
  ab; vorher führten verfälschte Kernzahlen (Datenschutz-Einstellungen mancher Browser) zu einem
  stehenden Hintergrund. Eine ausdrücklich gewählte Stufe gilt auch bei reduzierter Bewegung.
  Regendichte und Schleier entsprechen jetzt dem Prototyp. „Auto“ senkt höchstens auf die neue
  Stufe „Sparsam“ und wird nie zum Standbild; die Canvas-Größe ist gedeckelt.
- Website: Der Regen friert nicht mehr ein. Verliert der Browser den Grafikkontext (bei
  GPU-Speicherdruck, z. B. ausgelöst durch View Transitions oder backdrop-filter über dem Canvas),
  baut die Stadt neu auf und setzt nötigenfalls ein frisches Canvas ein; Fehler in einem Frame
  beenden die Zeichenschleife nicht mehr. Seitenwechsel nutzen keine View Transitions mehr, der
  Glitch-Streifen kein backdrop-filter, das Canvas liegt auf einer eigenen Compositing-Ebene.
- Website: Abgeschrägte Ecken an Schaltflächen, Panels, Item-Rahmen und Karten haben eine
  durchgehende Umrisslinie.
- Website: Bessere Lesbarkeit über dem Hintergrund – dunkler Halo für freistehende Titel und
  Tabs, Glasband unter den Tabs, Holo-Platte für den Startseiten-Hero, Rechtsseiten als Karte.

### Behoben

- Discord-Bot: Loot-Items nach dem Dungeon heißen wie auf der Website (Name der Vorlage in der
  Sprache des Nutzers) statt nach ihrer ID. Die Startwerte der Item-Vorlagen tragen dafür ihre
  Namen DE/EN selbst; ältere Konfigurationsversionen ohne Namen nutzen sie als Rückfall
  (`itemNames` in game-core).
- Dungeon: Auch der Kampf um Etage 1, der beim Start des Runs sofort ausgetragen wird, läuft jetzt
  im Kampf-HUD ab, bevor das Ergebnis erscheint (vorher nur ab Etage 2 über „Weiter“).
- Website: Die Season-Steuerung (und die Team-Seite) luden Konstanten aus dem Haupteinstieg von
  `@tbca/shared`, der zod mitbringt; im Dev-Server schlug das Nachladen der Seite mit „zod nicht
  gefunden“ fehl. Laufzeitwerte kommen jetzt aus `@tbca/shared/constants`, eine ESLint-Regel
  verhindert Laufzeit-Importe aus dem Haupteinstieg in der Website.
- Item-Editor: Das Feld „Name (Englisch)“ zeigte bei Vorlagen ohne eigenen Namen den deutschen
  Namen. Beide Felder zeigen jetzt den Namen ihrer Sprache (Übersetzung, sonst lesbare ID) mit
  dem Hinweis, dass er aus der Übersetzung stammt.

### Hinweise

- Nicht mit echter API und echten Geräten geprüft: Die Oberfläche wurde gegen einen Mock der API in
  Chromium (Desktop 1440 px, Mobil 390 px) durchgeklickt; Klänge (nur offline gerendert und
  gemessen, nicht über Lautsprecher abgehört), Performance des Regens auf schwachen Geräten,
  Seitenübergänge in Safari/Firefox und Touch-Drag auf echten Geräten sind ungetestet. Das
  Einfrieren des Regens trat nur unter Windows mit echter GPU auf (Brave, Opera GX) und ließ sich
  hier nicht nachstellen; die Selbstheilung ist mit simuliertem Kontextverlust getestet.
- Monster haben noch keine eigenen Silhouetten; das Kampf-HUD zeigt für sie eine Platzhalterform.

## [0.1.0] – 2026-11-24

Erstes spielbares MVP (Phase 1): Discord, PvP inklusive Teams, Dungeon, Wirtschaft, Admin-Basis
und Deployment auf VPS oder Raspberry Pi.

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
- Admin-Bereich für Superadmins: Zeitsteuerung für Test-Seasons (Zeitfaktor, Vorspulen um Stunde,
  Tag oder Woche), Spieler suchen, sperren und entsperren (Sessions enden sofort), XP und Credits mit
  Begründung korrigieren, Audit-Log aller Admin-Aktionen (Migration `0010_admin`).
- Spieluhr je Season in der Datenbank, damit alle Prozesse dieselbe Spielzeit sehen.
- Gesperrte Accounts werden bei jeder Anfrage und von den Bots abgewiesen.
- `scripts/admin.sh grant-superadmin <discord-id>` vergibt die Superadmin-Rolle.
- Worker (`apps/worker`) mit BullMQ: beendet Dungeon-Runs ohne Entscheidung nach Ablauf der Frist
  und räumt abgelaufene Sessions auf; die Logik bleibt über interne Endpunkte in der API. Im
  Sparprofil läuft er im kombinierten Prozess mit.
- Website: Admin-Seite mit Zeitsteuerung, Spieler-Werkzeugen und Audit-Log.
- Versionierte Season-Konfiguration: Entwürfe anlegen, bearbeiten und veröffentlichen; der Server
  prüft jede Konfiguration (Struktur und ein Probedurchlauf mit Charakteren, Items und Dungeon) und
  meldet Probleme verständlich. Veröffentlichen wirkt sofort und steht im Audit-Log.
- Item-Editor mit Live-Vorschau von Power-Budget, Basiswerten und Affix-Bereichen je Item-Level und
  Rarität sowie erweiterter JSON-Bearbeitung der gesamten Konfiguration.
- Bot-Spieler mit Agententypen (Gelegenheitsspieler, Aktiver, Farmer, Bergsteiger, Klassenwechsler):
  Sie kämpfen, laufen Dungeons, wechseln Klassen und verteilen Punkte über dieselben Regeln wie echte
  Spieler; nur in Test-Seasons, alle 5 Minuten über den Worker oder sofort im Admin-Bereich
  (Migration `0011_bot_agents`).
- Konto: verknüpfte Plattformen anzeigen, Sprache im Konto speichern (gilt auf allen Geräten),
  Charakter gegen Credits umbenennen (200 Credits, alle 30 Tage), alle gespeicherten Daten als JSON
  herunterladen und das Konto selbst löschen; in Replays anderer erscheint man danach als
  „Gelöschter Spieler“, Buchungen bleiben anonym erhalten.
- Community-Rollen: Wer einen Discord-Server mit `/tbca-admin einrichten` anlegt, wird
  Community-Admin; Admins vergeben Rollen, Moderatoren korrigieren XP ihrer Mitglieder (höchstens
  ±5 000 je Eingriff), alles im Audit-Log; Verwaltungsseite je Community.
- Datenschutzerklärung beschreibt, was TBCA tatsächlich speichert; Betreiberangaben für Impressum
  und Datenschutz stehen in `apps/web/public/legal.json`.
- Gespeicherte Konfigurationen werden mit neuen Feldern aus dem Code ergänzt (tiefe Zusammenführung).
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
