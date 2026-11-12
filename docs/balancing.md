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

## Offen

- Bruiser liegt ab Level 50 noch unter 45 %, Gunner knapp darüber; Medtech gegen Bruiser bleibt
  das schwierigste Duell (25–40 %).
- Level 1 ist wegen langer Kämpfe mit wenig Schaden noch medtech-lastig.
- Der Dungeon wird für den Medtech auf hohem Level zu leicht (Heilung zwischen den Etagen).
- Die Simulation kennt nur Duelle; Team-Kämpfe (2v2, 3v3) sind nicht kalibriert.
- Item-Vorlagen weichen von der Kurve ab: Schlagwaffe 115 %, Injektor 83 %, Pistole 95 %
  (siehe Item-Editor). Gewürfelte Basiswerte und Affixe bleiben bei bestehenden Items, die
  Waffen-Skalierung (Schadensart, Attribut, Schaden je Punkt) liest der Kampf aber aus der
  Vorlage – eine Änderung dort wirkt sofort auch auf vorhandene Waffen. Das gilt auch für die
  neue Pistolen-Skalierung, sobald sie veröffentlicht ist.
