# Balancing

Wie die Startwerte (`packages/game-core/src/content/default-config.ts`) kalibriert werden und
was die erste Angleichung geändert hat.

## Werkzeuge

- **Simulation** (`/admin/simulation`): Gewinnraten-Matrix Klasse × Klasse und Dungeon-Tiefe
  gegen eine Konfigurationsversion, optional im Vergleich zur veröffentlichten.
- **Balancing-Report** (gleiche Seite): Level 3–80 mit typischer Ausrüstung in einem Durchlauf,
  Download als JSON (`tbca-sim-report/v1`, enthält die vollständige Konfiguration) oder CSV.
- **Datenexport** (`/admin`, „Daten exportieren“): anonymisierte Builds, Kämpfe mit den Werten
  aller Beteiligten, Dungeon-Runs und Wirtschafts-Kennzahlen (`tbca-data/v1`).
- **Item-Werte** (`/admin/items`, „Import/Export“): normiertes Format `tbca-items/v1` mit
  Kurven-Abgleich je Vorlage.

Eine neue Code-Version mit geänderten Startwerten wirkt nicht auf die laufende Season – deren
Konfiguration liegt versioniert in der Datenbank. Übernehmen: im Item-Editor „Entwurf aus
Startwerten (Code)“, in der Simulation mit der veröffentlichten Version vergleichen, dann
veröffentlichen.

## Vorgehen

Duelle aller Klassenpaare, je Paarung 200 Kämpfe (beide Startpositionen), mit Bot-Builds
(55–65 % der Punkte ins Hauptattribut, Rest überwiegend Konstitution) und Ausrüstung je Stufe:
★3 bis Level 20, ★7 auf Level 30/50, ★11 auf Level 50/80. Ziel: Gesamtquote je Klasse
40–60 %, Dreieck-Paarungen (STR > GES > INT > STR) etwa 60–70 % für die überlegene Seite.
Die Parameter wurden mit einer Koordinatensuche über zwei Seeds eingegrenzt und mit einem
dritten Seed geprüft; die Medtech-Heilung danach von Hand für Level 1–3 nachgezogen.

## Ursachen

- **GES war überladen:** Ein Punkt gab Crit-Chance, Initiative, Genauigkeit und Ausweichen.
  Auf hohem Level handelte der Gunner fast doppelt so oft, traf fast immer und wich jedem
  dritten Angriff aus – 87–100 % Siegquote ab Level 30.
- **Bruiser verschenkte Züge:** Die Standard-Taktik spottete auch im Duell, wo Spott nichts
  bringt, und STR schützte nur gegen physischen Schaden.
- **Medtech heilte auf niedrigem Level schneller, als Gegner trafen** (94 % auf Level 1), und
  Toxin, Virus, Schockwelle und Kugelhagel kamen in den Standard-Taktiken gar nicht vor.

## Änderungen

| Wert                              | vorher                         | nachher       |
| --------------------------------- | ------------------------------ | ------------- |
| Initiative je GES / je Level      | 0,40 / 0                       | 0,06 / 2      |
| Genauigkeit je GES / je Level     | 0,50 / 1                       | 0,06 / 2      |
| Ausweichen je GES / je Level      | 0,25 / 1                       | 0,01 / 2      |
| Crit-Chance je GES / Obergrenze   | 1,2 ‰ / 600 ‰                  | 0,3 ‰ / 500 ‰ |
| Firewall je STR                   | 0                              | 1,4           |
| Bruiser: Schwerer Schlag          | 180 %                          | 210 %         |
| Gunner: Doppelschuss              | 2 × 70 %                       | 2 × 85 %      |
| Pistole (Vorlage und Startwaffe)  | 0,75 je GES                    | 0,875 je GES  |
| Netrunner: Durchdringung passiv   | 20 %                           | 25 %          |
| Netrunner: Einbruch-Durchdringung | 30 %                           | 25 %          |
| Medtech: Flicken, Grundwert       | 20                             | 12            |
| Startwaffen ohne Ausrüstung       | Pistole 11 / Injektor 12 + 0,8 | 14 / 15 + 0,9 |

Standard-Taktiken: Bruiser spottet und nutzt Schockwelle nur ab zwei Gegnern, Gunner nutzt
Kugelhagel ab zwei Gegnern, Netrunner setzt Virus, Medtech Toxin, wenn das Ziel noch keinen
Schaden über Zeit hat. Gespeicherte Taktiken von Spielern bleiben unverändert.

## Ergebnis (Gesamt-Siegquote in %)

| Stufe   | Bruiser | Gunner   | Netrunner | Medtech |
| ------- | ------- | -------- | --------- | ------- |
| L1 ★3   | 26 → 39 | 15 → 33  | 65 → 57   | 94 → 75 |
| L3 ★3   | 25 → 46 | 27 → 41  | 65 → 55   | 85 → 57 |
| L10 ★3  | 27 → 49 | 54 → 46  | 62 → 52   | 57 → 48 |
| L20 ★3  | 24 → 45 | 76 → 52  | 55 → 53   | 43 → 46 |
| L30 ★7  | 13 → 41 | 93 → 53  | 53 → 54   | 44 → 46 |
| L50 ★7  | 16 → 43 | 97 → 55  | 48 → 52   | 40 → 50 |
| L80 ★11 | 19 → 38 | 100 → 58 | 43 → 48   | 37 → 57 |

Mittlere Dungeon-Tiefe: L10 4,3 → 3,8, L30 8,7 → 7,7, L80 16,8 → 22,5 Etagen.

## Zweite Runde

Grundlage: eigene Simulation (Duelle auf Level 1–80 mit 150 Kämpfen je Paarung, dazu neu die
Team-Simulation 2v2/3v3 und die Dungeon-Tiefe). Echte Spielerdaten (Report, Datenexport)
lagen noch nicht vor. Die Koordinatensuche bewertete Duelle und Teams gemeinsam (Gesamtquote
je Klasse 50 %, Dreieck 62/38 %, Team-Beitrag je Klasse 50 %) über zwei Seeds; geprüft mit
einem dritten.

| Wert                                   | vorher   | nachher    |
| -------------------------------------- | -------- | ---------- |
| Medtech: Flicken, Grundwert            | 12       | 10         |
| Bruiser: Schwerer Schlag               | 210 %    | 220 %      |
| Bruiser: Verschanzen je KON            | 1,5      | 1,4        |
| Gunner: Doppelschuss                   | 2 × 85 % | 2 × 87,5 % |
| Heilung im Dungeon (`healingPermille`) | 100 %    | 60 %       |
| Schlagwaffe (Vorlage), Schaden je STR  | 1,0      | 0,925      |
| Injektor (Vorlage), Schaden je INT     | 0,8      | 0,9        |

Die Heilung im Dungeon ist eine neue Regel: Eigene Heilfähigkeiten wirken dort nur zu 60 %
(Abzug additiv zum Heil-Bonus der Klasse). Schilde sind nicht betroffen. Bot-Gegner im PvP
tragen jetzt Ausrüstung nach Level (`pvp.botGear`, ★2 bis ★9).

Kurven-Abgleich danach: Schlagwaffe 103 %, Injektor 99 %, Pistole 95 % (bewusst: der
Gunner hat zusätzlich Crit-Chance im Passiv).

### Ergebnis (Gesamt-Siegquote in %, Bruiser / Gunner / Netrunner / Medtech)

| Stufe   | Duell vorher      | Duell nachher     | 3v3-Beitrag nachher | Ø Dungeon-Tiefe vorher → nachher (Medtech) |
| ------- | ----------------- | ----------------- | ------------------- | ------------------------------------------ |
| L1 ★3   | 37 / 32 / 57 / 74 | 46 / 37 / 60 / 56 | 48 / 41 / 45 / 67   | 1,2 → 0,8 (1,8 → 0,5)                      |
| L10 ★3  | 51 / 44 / 60 / 49 | 54 / 46 / 59 / 47 | 62 / 50 / 49 / 39   | 3,8 → 3,6 (4,5 → 3,9)                      |
| L30 ★7  | 45 / 53 / 56 / 46 | 49 / 54 / 55 / 43 | 57 / 56 / 49 / 38   | 7,9 → 7,6 (10,1 → 9,3)                     |
| L50 ★7  | 44 / 56 / 53 / 52 | 45 / 56 / 51 / 50 | 53 / 58 / 46 / 42   | 10,8 → 10,4 (13,9 → 12,4)                  |
| L80 ★11 | 39 / 57 / 48 / 62 | 40 / 58 / 47 / 60 | 48 / 56 / 45 / 51   | 21,1 → 19,0 (32 → 23,8)                    |

Gemischte Aufstellungen gewinnen gegen solche mit doppelter Klasse 53–61 %; reine
Dreier-Stapel einer Klasse landen unten.

Versuche, die nicht übernommen wurden: mehr Heilung oder stärkere Barriere hebt den Medtech
im 3v3 um 3–5 Punkte, macht ihn aber im Duell auf Level 80 zu stark (63–65 %) und den Bruiser
dort noch schwächer. Ein Stimulans in der Standard-Taktik half dem Team nicht.

## Team-Stimulans

Mehr Heilung half dem Medtech im Team kaum, machte ihn aber im Duell stärker; eine
schwächere Selbstheilung (Versuch mit einer Kampfregel) brach ihn im Duell ein (Level 1–30
nur noch 14–33 %), ohne das Team spürbar zu heben. Den Ausschlag gibt eine Team-Fähigkeit:

- Neues Fähigkeitsziel `all_allies` (alle lebenden Verbündeten). Bestehende Kämpfe ändern sich
  dadurch nicht, die Engine-Version bleibt 2.
- „Stimulans“ (ab Level 5) wirkt jetzt auf das ganze Team: säubert, heilt 15 + 0,4 je INT und
  gibt 2 Züge +15 % Schaden (vorher ein Verbündeter, +20 % Schaden, keine Heilung). Die
  Standard-Taktik des Medtech setzt es zuerst, sobald mindestens zwei Gegner da sind – im
  Duell also nie.

| Stufe   | 3v3-Beitrag vorher (B/G/N/M) | nachher           | 2v2 nachher       |
| ------- | ---------------------------- | ----------------- | ----------------- |
| L10 ★3  | 62 / 50 / 49 / 39            | 59 / 49 / 44 / 48 | 55 / 50 / 48 / 47 |
| L20 ★3  | 57 / 54 / 48 / 41            | 56 / 53 / 45 / 45 | 54 / 54 / 51 / 42 |
| L30 ★7  | 57 / 56 / 49 / 38            | 54 / 55 / 45 / 46 | 53 / 52 / 51 / 43 |
| L50 ★7  | 53 / 58 / 46 / 42            | 52 / 57 / 42 / 49 | 51 / 55 / 49 / 45 |
| L80 ★11 | 48 / 56 / 45 / 51            | 47 / 56 / 43 / 54 | 47 / 57 / 43 / 53 |

Duelle bleiben unverändert. Im Dungeon wirkt das Stimulans ab mehreren Monstern als
Selbstheilung mit; Ø Tiefe des Medtech auf Level 80 23,8 → 21,2 Etagen.

## Offen

- Bruiser im Duell auf Level 80 bei 40 % (gegen Medtech 29 %), im Team dagegen stark (3v3 auf
  Level 10–30 57–62 %).
- Im Team ist jetzt der Netrunner am schwächsten (3v3 42–45 %), der Medtech im 2v2 auf Level
  20–30 noch bei 42–43 %.
- Dreieck auf niedrigem Level zu steil: Bruiser gegen Gunner 75–91 % bis Level 10; Gunner auf
  Level 1 bei 37 %.
- Auf Level 1 kommt im Dungeon kaum jemand über Etage 1; der Medtech mit gekürzter Heilung
  noch weniger.
- Alles ohne echte Spielerdaten; die nächste Runde braucht Report und Datenexport.
