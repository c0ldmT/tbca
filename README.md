# TBCA – TurnBased Cyber Arena

Webbasiertes, rundenbasiertes Auto-Battler-RPG im Cyberpunk-Stil, das Communities auf Discord,
Twitch und im Web aktiv hält. Die vollständige Spezifikation liegt außerhalb des Repos
(„TBCA – Spezifikation v0.1“).

> Status: **Phase 0 – Fundament.** Noch nicht spielbar.

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

## Patches einspielen

Änderungen werden als `git format-patch`-Dateien geliefert:

```bash
git am --3way patches/session-01/*.patch
```

Commits folgen [Conventional Commits](https://www.conventionalcommits.org/de/v1.0.0/).

## Lizenz

[MIT](LICENSE)
