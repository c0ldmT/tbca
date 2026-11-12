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

Die Entwicklungsdaten enthalten eine Test-Season und 16 Bot-Gegner, damit sich Arena und Replays
auch allein ausprobieren lassen; dazu gibt es Trainingskämpfe gegen frei wählbare Gegner.

Postgres und Valkey laufen in der Entwicklung auf den Ports 55432 und 56379, damit sie nicht
mit lokal installierten Diensten kollidieren; ändern lässt sich das in `.env.development`.

Unter Windows laufen alle Scripts in WSL2 (Ubuntu) mit Docker Desktop oder Docker Engine.

### Im Heimnetz testen

`scripts/dev.sh lan` startet alles wie `scripts/dev.sh`, nur lauscht der Dev-Server auf allen
Schnittstellen. Das Script findet die LAN-Adresse selbst (oder nimmt `TBCA_LAN_HOST=<IP>`),
erlaubt sie der API als Origin (`WEB_EXTRA_ORIGINS`) und zeigt an, was noch zu tun ist:

- **Discord-Login:** Der Rücksprung geht an die Adresse, über die der Browser kam. Dafür muss
  `http://<IP>:4200/api/auth/discord/callback` zusätzlich in der Discord-App unter
  OAuth2 → Redirects stehen; das Script gibt die genaue Adresse aus. Eine feste IP im Router
  erspart das erneute Eintragen.
- **Ohne Discord:** Mit `DEV_LOGIN=true` in `.env.development` gibt es auf der Startseite einen
  Testzugang per Name – praktisch für Mitspieler ohne eingetragenen Redirect. In Produktion
  verweigert die API den Start mit dieser Einstellung.
- **Von außerhalb des Heimnetzes:** ein Tunnel mit fester HTTPS-Adresse (z. B. Tailscale Funnel
  oder Cloudflare Tunnel); deren Adresse als `WEB_EXTRA_ORIGINS` und Discord-Redirect eintragen.
- **WSL2:** Andere Geräte erreichen WSL nur über Windows – entweder `networkingMode=mirrored` in
  `%UserProfile%\.wslconfig` (Windows 11) oder eine Portweiterleitung mit `netsh`; das Script
  zeigt den Befehl an. In beiden Fällen Port 4200 in der Windows-Firewall freigeben.

## Scripts

| Script               | Zweck                                                                      |
| -------------------- | -------------------------------------------------------------------------- |
| `scripts/setup.sh`   | pnpm und Abhängigkeiten installieren, `.env.<umgebung>` anlegen            |
| `scripts/dev.sh`     | Dienste per Docker, Apps nativ; `lan`, `services`, `down`, `reset`, `logs` |
| `scripts/test.sh`    | Prettier, ESLint, Typprüfung, Unit-Tests, `pnpm audit`                     |
| `scripts/migrate.sh` | Migrationen ausführen; `generate`, `seed`                                  |
| `scripts/bot.sh`     | Discord-Bot: `register-commands`                                           |
| `scripts/build.sh`   | Produktions-Images bauen (`--platform`, `--save`, `--push`)                |
| `scripts/deploy.sh`  | Ausrollen mit Backup, Migration, Healthcheck und Rollback                  |
| `scripts/backup.sh`  | Datenbank sichern, auflisten, wiederherstellen                             |

Jedes Script zeigt mit `--help` seine Optionen. Die Umgebung wählt `TBCA_ENV`
(`development` oder `production`); Variablen sind in `.env.example` dokumentiert.

## Produktion

Siehe [docs/deployment.md](docs/deployment.md): VPS oder Raspberry Pi 3, Profile, Updates,
Rollback und Backups.

## Patches einspielen

Änderungen werden als `git format-patch`-Dateien geliefert:

```bash
git am --3way patches/session-01/*.patch
```

Commits folgen [Conventional Commits](https://www.conventionalcommits.org/de/v1.0.0/).

## Lizenz

[MIT](LICENSE)
