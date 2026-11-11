# @tbca/web

Website auf Angular 22 (Standalone, Signals, zoneless) mit Laufzeit-Übersetzung über Transloco.

| Befehl                          | Zweck                                                       |
| ------------------------------- | ----------------------------------------------------------- |
| `scripts/dev.sh`                | startet Web (Port 4200) zusammen mit API und Diensten       |
| `pnpm --filter @tbca/web dev`   | nur der Dev-Server; `/api` wird an Port 3000 weitergeleitet |
| `pnpm --filter @tbca/web build` | Produktions-Build nach `dist/web/browser`                   |
| `pnpm --filter @tbca/web test`  | Unit-Tests (Vitest, jsdom)                                  |

## Aufbau

- `src/app/core`: Anmeldestatus (`AuthService`), Sprachwahl, Übersetzungs-Loader.
- `src/app/shared/glitch.directive.ts`: `tbcaGlitch` – RGB-Split und Slice-Verschiebung,
  höchstens 300 ms, aus bei `prefers-reduced-motion`.
- `src/app/pages`: Startseite mit Testkampf, Impressum, Datenschutz, 404.
- `public/i18n`: Übersetzungen (`de.json`, `en.json`); fehlt ein Schlüssel, greift Englisch.

## Regeln

- Design-Tokens kommen aus `@tbca/assets/tokens.css`, keine Farbwerte direkt in Komponenten.
- Werte aus `@tbca/shared` nur über `@tbca/shared/constants` importieren; der Haupteinstieg zieht
  Zod ins Bundle. Typen dürfen per `import type` aus `@tbca/shared` kommen.
- Schriften werden lokal ausgeliefert (`@fontsource`), nie von Google-Servern geladen.
- Kein Token im Browser-Speicher: Die Session steckt im httpOnly-Cookie; `localStorage`
  enthält nur die Sprachwahl.
- Der Testkampf rechnet mit `@tbca/game-core` im Browser; sein Fingerabdruck muss dem auf dem
  Server entsprechen (Test in `demo-battle.spec.ts`).
