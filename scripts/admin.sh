#!/usr/bin/env bash
# Verwaltung von Rollen.
#
#   scripts/admin.sh grant-superadmin <discord-id>    Account zum Superadmin machen
#   scripts/admin.sh revoke-superadmin <discord-id>   Rolle wieder entziehen
#
# Umgebung über TBCA_ENV (Standard: development). In Produktion läuft der Befehl im Container:
#   TBCA_ENV=production scripts/admin.sh grant-superadmin <discord-id>

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

cd "$ROOT_DIR" || exit 1
load_env
id="${2:-}"

run_grant() {
  if [[ "$(tbca_env)" == production ]]; then
    compose_prod --profile tools run --rm migrate node packages/db/dist/cli/grant.js "$id" "$1"
  else
    pnpm --filter @tbca/db run --silent grant "$id" "$1"
  fi
}

case "${1:-}" in
  grant-superadmin) run_grant grant ;;
  revoke-superadmin) run_grant revoke ;;
  -h | --help | "") sed -n '2,9p' "$0" ;;
  *) die "Unbekannter Befehl: $1 (siehe scripts/admin.sh --help)" ;;
esac
