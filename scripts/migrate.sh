#!/usr/bin/env bash
# Datenbank-Migrationen.
#
#   scripts/migrate.sh             ausstehende Migrationen ausführen
#   scripts/migrate.sh generate    neue Migration aus dem Drizzle-Schema erzeugen
#   scripts/migrate.sh seed        Entwicklungsdaten einspielen (nur development)
#
# Umgebung über TBCA_ENV (Standard: development), z. B. TBCA_ENV=production scripts/migrate.sh

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

cd "$ROOT_DIR" || exit 1
load_env

[[ -f "$ROOT_DIR/packages/db/package.json" ]] || die "packages/db fehlt – noch kein Datenbankschema vorhanden."

case "${1:-up}" in
  up)
    info "Führe Migrationen aus ($(tbca_env))"
    pnpm --filter @tbca/db run --silent migrate
    ;;
  generate)
    info "Erzeuge Migration aus dem Schema"
    pnpm --filter @tbca/db run --silent generate
    ;;
  seed)
    [[ "$(tbca_env)" == development ]] || die "Seed ist nur für die Entwicklung gedacht."
    info "Spiele Entwicklungsdaten ein"
    pnpm --filter @tbca/db run --silent seed
    ;;
  -h | --help) sed -n '2,9p' "$0" ;;
  *) die "Unbekannter Befehl: $1 (siehe scripts/migrate.sh --help)" ;;
esac
ok "Fertig"
