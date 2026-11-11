# TBCA – TurnBased Cyber Arena

Webbasiertes, rundenbasiertes Auto-Battler-RPG im Cyberpunk-Stil, das Communities auf Discord,
Twitch und im Web aktiv hält. Die vollständige Spezifikation liegt außerhalb des Repos
(„TBCA – Spezifikation v0.1“).

> Status: **Phase 0 – Fundament.** Noch nicht spielbar; Login und Testkampf funktionieren.

## Voraussetzungen

| Werkzeug       | Version                | Hinweis                                    |
| -------------- | ---------------------- | ------------------------------------------ |
| Node.js        | 24 LTS (mind. 22.22.3) | siehe `.nvmrc`                             |
| pnpm           | 12.16.1                | wird von `scripts/setup.sh` installiert    |
| Docker Compose | v2                     | für Postgres und Valkey in der Entwicklung |
| Bash           | 4+                     | unter Windows in WSL2 (Ubuntu)             |

## Struktur

```text
tbca/
├── apps/        # web, api, worker, bot-discord, bot-twitch
├── packages/    # game-core, shared, db, assets
├── infra/       # Docker Compose, Caddy
└── scripts/     # alle Abläufe als Bash-Scripts
```

## Schnellstart

```bash
scripts/setup.sh   # pnpm, Abhängigkeiten, .env.development
scripts/dev.sh     # Postgres + Valkey (Docker), Migrationen, Apps mit Hot Reload
scripts/test.sh    # Format, Lint, Typen, Tests, Audit
```

Danach läuft die Website unter <http://localhost:4200>, die API unter
<http://localhost:3000/api/health>. Für den Login wird eine
Discord-Developer-App benötigt (siehe [apps/api/README.md](apps/api/README.md)).

Unter Windows laufen alle Scripts in WSL2 (Ubuntu) mit Docker Desktop oder Docker Engine.

## Scripts

| Script               | Zweck                                                               |
| -------------------- | ------------------------------------------------------------------- |
| `scripts/setup.sh`   | pnpm und Abhängigkeiten installieren, `.env.<umgebung>` anlegen     |
| `scripts/dev.sh`     | Dienste per Docker, Apps nativ; `services`, `down`, `reset`, `logs` |
| `scripts/test.sh`    | Prettier, ESLint, Typprüfung, Unit-Tests, `pnpm audit`              |
| `scripts/migrate.sh` | Migrationen ausführen; `generate`, `seed`                           |

Jedes Script zeigt mit `--help` seine Optionen. Die Umgebung wählt `TBCA_ENV`
(`development` oder `production`); Variablen sind in `.env.example` dokumentiert.

## Patches einspielen

Änderungen werden als `git format-patch`-Dateien geliefert:

```bash
git am --3way patches/session-01/*.patch
```

Commits folgen [Conventional Commits](https://www.conventionalcommits.org/de/v1.0.0/).

## Lizenz

[MIT](LICENSE)
