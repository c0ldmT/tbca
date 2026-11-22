# Betrieb und Deployment

TBCA läuft in Produktion als Docker-Compose-Stack: Caddy (HTTPS, Website, Proxy), API,
Discord-Bot, PostgreSQL und Valkey. Alles wird über Scripts gesteuert.

## Profile

| Profil     | Ziel                      | Aufteilung                                    |
| ---------- | ------------------------- | --------------------------------------------- |
| `standard` | VPS (ab 2 GB RAM)         | API und Discord-Bot in eigenen Containern     |
| `compact`  | Raspberry Pi 3 (1 GB RAM) | ein Node-Prozess für API und Bot, sparsame DB |

Das Profil steht als `TBCA_PROFILE` in `.env.production`. Für `compact` gelten ohne eigene Werte:
`shared_buffers=64MB`, `effective_cache_size=256MB`, `work_mem=2MB`, `max_connections=20`,
Valkey mit 32 MB, Node-Heap 256 MB und 5 Datenbankverbindungen.

## Erstes Deployment auf einem VPS

```bash
# Docker Engine mit Compose-Plugin installieren, dann:
git clone git@github.com:c0ldmT/tbca.git && cd tbca
scripts/setup.sh --prod          # legt .env.production mit Zufallswerten an
nano .env.production             # TBCA_DOMAIN, ACME_EMAIL, WEB_ORIGIN, Discord-Werte
scripts/deploy.sh --build        # bauen, migrieren, starten, Healthcheck
```

Vorher den DNS-Eintrag der Domain auf den Server zeigen lassen und die Ports 80 und 443 öffnen.
In der **Produktions**-App im Discord-Developer-Portal die Redirect-URL
`https://<domain>/api/auth/discord/callback` eintragen.

Danach dich selbst zum Superadmin machen (einmal auf der Website angemeldet, Discord-ID im
Entwicklermodus kopieren): `TBCA_ENV=production scripts/admin.sh grant-superadmin <discord-id>`.

## Raspberry Pi 3

Der Pi braucht ein 64-Bit-Betriebssystem (Raspberry Pi OS Lite 64-bit) und etwas Swap
(z. B. 1 GB). Gebaut wird auf dem PC, weil der Build auf dem Pi zu lange dauert:

```bash
# Auf dem PC (Docker Desktop oder Buildx):
scripts/build.sh --platform linux/arm64 --save tbca-images.tar.gz
scp tbca-images.tar.gz pi@raspberrypi:~/tbca/

# Auf dem Pi, im geklonten Repo mit .env.production (TBCA_PROFILE=compact):
scripts/deploy.sh --load tbca-images.tar.gz --tag <Tag aus der Build-Ausgabe>
```

Ohne öffentliche Domain kann `TBCA_DOMAIN` auch `:80` sein (nur HTTP im Heimnetz). Dann
`COOKIE_SECURE=false` und `WEB_ORIGIN=http://<ip-des-pi>` setzen.

## Updates und Rollback

`scripts/deploy.sh` macht bei jedem Lauf: Backup → Migrationen → Start → Healthcheck. Scheitert
der Healthcheck, läuft automatisch wieder die vorherige Version. Manuell zurück geht es mit
`scripts/deploy.sh --rollback`. Migrationen laufen nur vorwärts; muss die Datenbank auf den Stand
vor dem Deployment zurück, `scripts/backup.sh restore backups/<datei>` nutzen.

## Backups

```bash
scripts/backup.sh            # sichert nach backups/, behält BACKUP_KEEP Stück (Standard 14)
scripts/backup.sh list
scripts/backup.sh restore backups/tbca-20261120-030000.dump
```

Für tägliche Backups einen Cronjob anlegen, z. B. `0 3 * * * cd ~/tbca && scripts/backup.sh`.
Backups liegen auf demselben Rechner – für echte Sicherheit regelmäßig woanders hin kopieren.

## Sicherheit

- Caddy setzt HTTPS (HSTS), eine strenge Content-Security-Policy und weitere Sicherheits-Header.
- Postgres und Valkey sind nicht von außen erreichbar; nur Caddy veröffentlicht Ports.
- Die API begrenzt Anfragen je Session bzw. IP (`RATE_LIMIT_PER_MINUTE`, Login strenger); die
  Zähler liegen in Valkey, damit sie für alle Prozesse gelten.
- Container laufen ohne Root-Rechte (Node-Images) mit nur den Produktionsabhängigkeiten.
