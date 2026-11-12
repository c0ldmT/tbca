# @tbca/game-core

Reine, deterministische Spiellogik. Wird identisch von Server, Browser-Replays und
Simulationen genutzt und hat keinen Zugriff auf Datenbank, Netzwerk oder Systemuhr.

| Modul         | Inhalt                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| `random/prng` | `Xoshiro128ss` – einzige Zufallsquelle, Seed als Zahl oder String       |
| `math/fixed`  | Festkomma-Arithmetik (Faktor 10 000) mit exakter Rundung                |
| `content`     | Spielinhalte als Daten: Klassen, Fähigkeiten, Stat-Formeln, XP-Kurve    |
| `character`   | Build prüfen, Momentaufnahme ableiten, Punkte, Umskillen, Level aus XP  |
| `battle`      | `simulateBattle` – N gegen N, Fähigkeiten, Status, Taktikregeln, Log    |
| `clock`       | `GameClock` mit Zeitfaktor und Vorspulen, `TimerQueue` für fällige Jobs |

## Regeln für diesen Code

- Kein `Math.random`, kein `Date`, keine Node-APIs; ESLint erzwingt das.
- Keine Gleitkomma-Funktionen wie `Math.pow`, `Math.exp` oder `Math.log` in der Simulation.
- Ändert sich das Event-Log bei gleicher Eingabe, wird `ENGINE_VERSION` erhöht und die
  Referenz-Fingerabdrücke im Test werden bewusst neu gesetzt.

## Kampfsystem (Engine-Version 2)

- **Zug:** Schaden über Zeit → Betäubung → Energie-Regeneration und Abklingzeiten → Aktion.
- **Aktion:** erste Taktikregel, deren Fähigkeit bereit ist (Energie, Abklingzeit), ein Ziel hat
  und deren Bedingung gilt; sonst Basisangriff auf das Ziel mit der höchsten Bedrohung.
- **Effekte:** Schaden (mehrere Treffer, Durchdringung, Crit-Bonus), Heilung, Schild, Betäubung,
  Schaden über Zeit, Verstärkung/Schwächung, Provokation, Energieentzug, Reinigung.
- **Statusdauer** zählt in Zügen des Trägers und läuft am Ende seines Zuges ab.
- **Attributs-Dreieck:** STR schlägt DEX, DEX schlägt INT, INT schlägt STR (+15 % Schaden).
- **Momentaufnahmen** enthalten Fähigkeiten und Taktik vollständig, damit ein gespeicherter Kampf
  unabhängig von späteren Konfigurationsänderungen reproduzierbar bleibt.
