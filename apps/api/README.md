# @tbca/api

REST-API auf NestJS mit Fastify. Alle Routen liegen unter `/api`.

| Route                            | Zweck                                          |
| -------------------------------- | ---------------------------------------------- |
| `GET /api/health`                | Healthcheck (200 / 503) mit Datenbankstatus    |
| `GET /api/auth/discord`          | Startet den Discord-Login                      |
| `GET /api/auth/discord/callback` | Rückkehr von Discord, setzt das Session-Cookie |
| `GET /api/auth/me`               | Aktueller Account, Identitäten und CSRF-Token  |
| `POST /api/auth/logout`          | Abmelden (Header `x-csrf-token` erforderlich)  |

## Discord-App einrichten (Entwicklung)

1. Unter <https://discord.com/developers/applications> eine App „TBCA Dev“ anlegen.
2. Unter **OAuth2 → Redirects** eintragen: `http://localhost:4200/api/auth/discord/callback`
3. Client-ID und Client-Secret in `.env.development` setzen (`DISCORD_CLIENT_ID`,
   `DISCORD_CLIENT_SECRET`).

Ohne diese Werte startet die API trotzdem; der Login antwortet dann mit 503.

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
