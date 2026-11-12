# @tbca/api

REST-API auf NestJS mit Fastify. Alle Routen liegen unter `/api`.

| Route                            | Zweck                                          |
| -------------------------------- | ---------------------------------------------- |
| `GET /api/health`                | Healthcheck (200 / 503) mit Datenbankstatus    |
| `GET /api/auth/discord`          | Startet den Discord-Login                      |
| `GET /api/auth/discord/callback` | Rückkehr von Discord, setzt das Session-Cookie |
| `GET /api/auth/me`               | Aktueller Account, Identitäten und CSRF-Token  |
| `POST /api/auth/logout`          | Abmelden (Header `x-csrf-token` erforderlich)  |
| `GET /api/auth/options`          | Angebotene Anmeldewege (`discord`, `devLogin`) |
| `POST /api/auth/dev-login`       | Testzugang per Name, nur mit `DEV_LOGIN=true`  |

### Admin (nur Superadmins, schreibend mit CSRF-Token)

| Route                                    | Zweck                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/season`                  | Laufende Season: Zeitraum, Kennzahlen des Tages, Rücksetzungen                                          |
| `POST /api/admin/season/daily-reset`     | Tageslimits (`dungeon`, `fights`, `passive`) für alle/einen                                             |
| `POST /api/admin/season/jobs/:job`       | Job sofort: `season-stats`, `flush-passive-xp`, `expire-dungeon-runs`, `end-dungeon-runs`, `bot-agents` |
| `PUT /api/admin/season/end`              | Season-Ende verschieben                                                                                 |
| `POST /api/admin/season/reset`           | `progress` oder `wipe`, Bestätigung mit dem Season-Slug                                                 |
| `POST /api/admin/config/drafts`          | Entwurf aus Version, veröffentlichter Version oder `defaults`                                           |
| `POST /api/admin/simulations`            | Simulation einer Stufe (Matrix, Dungeon oder Team-Aufstellungen 2v2/3v3)                                |
| `POST /api/admin/simulations/report`     | Report über Level 3–80 mit Teams und Konfiguration (`tbca-sim-report/v1`)                               |
| `GET /api/admin/export?days=&maxFights=` | Anonymisierter Datenexport (`tbca-data/v1`)                                                             |

## Discord-App einrichten (Entwicklung)

1. Unter <https://discord.com/developers/applications> eine App „TBCA Dev“ anlegen.
2. Unter **OAuth2 → Redirects** eintragen: `http://localhost:4200/api/auth/discord/callback`
3. Client-ID und Client-Secret in `.env.development` setzen (`DISCORD_CLIENT_ID`,
   `DISCORD_CLIENT_SECRET`).

Ohne diese Werte startet die API trotzdem; der Login antwortet dann mit 503.

Weitere Adressen der Website (z. B. die LAN-Adresse des Dev-Servers) stehen in
`WEB_EXTRA_ORIGINS`. Der Login springt dann an die Adresse zurück, über die er gestartet wurde
(`<Adresse>/api/auth/discord/callback` – auch diese in der Discord-App eintragen); CSRF-Prüfung
und Rücksprung erlauben nur Adressen aus `WEB_ORIGIN` und `WEB_EXTRA_ORIGINS`.

## Sicherheit

- Sessions: zufälliges Token im httpOnly-Cookie (`SameSite=Lax`, in Produktion `Secure` und
  `__Host-`-Präfix); in der Datenbank steht nur der SHA-256-Hash.
- OAuth-State im signierten Cookie, Vergleich in konstanter Zeit.
- Schreibende Anfragen brauchen das CSRF-Token aus `/api/auth/me`; fremde Origins werden abgelehnt.
- Logs enthalten nur Methode, Pfad ohne Query und Status – keine IPs, Cookies oder Header.

## Architektur-Hinweis

Alle Abhängigkeiten werden über Tokens aus `src/tokens.ts` injiziert. So läuft die API mit
`tsx` und Vitest ohne Decorator-Metadaten. `createApiApp()` in `src/app.ts` startet die API als
Modul, damit sie im Sparprofil später mit Worker und Bots in einem Prozess laufen kann.
