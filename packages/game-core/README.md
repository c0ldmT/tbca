# @tbca/game-core

Reine, deterministische Spiellogik. Wird identisch von Server, Browser-Replays und
Simulationen genutzt und hat keinen Zugriff auf Datenbank, Netzwerk oder Systemuhr.

| Modul         | Inhalt                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| `random/prng` | `Xoshiro128ss` – einzige Zufallsquelle, Seed als Zahl oder String       |
| `math/fixed`  | Festkomma-Arithmetik (Faktor 10 000) mit exakter Rundung                |
| `battle`      | `simulateBattle` – N gegen N, Initiative-Leiste, Event-Log mit Hash     |
| `clock`       | `GameClock` mit Zeitfaktor und Vorspulen, `TimerQueue` für fällige Jobs |

## Regeln für diesen Code

- Kein `Math.random`, kein `Date`, keine Node-APIs; ESLint erzwingt das.
- Keine Gleitkomma-Funktionen wie `Math.pow`, `Math.exp` oder `Math.log` in der Simulation.
- Ändert sich das Event-Log bei gleicher Eingabe, wird `ENGINE_VERSION` erhöht und die
  Referenz-Fingerabdrücke im Test werden bewusst neu gesetzt.
