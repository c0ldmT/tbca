#!/usr/bin/env bash
# Qualitätsprüfung: Format, Lint, Typprüfung, Unit-Tests und Sicherheits-Audit.
# Läuft lokal, auf dem VPS und unverändert in CI.
#
#   scripts/test.sh              alles
#   scripts/test.sh --no-audit   ohne pnpm audit (z. B. offline)

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

AUDIT=true
for arg in "$@"; do
  case "$arg" in
    --no-audit) AUDIT=false ;;
    -h | --help)
      sed -n '2,6p' "$0"
      exit 0
      ;;
    *) die "Unbekannte Option: $arg" ;;
  esac
done
cd "$ROOT_DIR" || exit 1
require_cmd pnpm "Bitte zuerst scripts/setup.sh ausführen."

step() {
  info "$1"
  shift
  "$@"
}

step "Format (Prettier)" pnpm run --silent format:check
step "Lint (ESLint)" pnpm run --silent lint
step "Typprüfung" pnpm run --silent typecheck
step "Unit-Tests" pnpm run --silent test
if [[ "$AUDIT" == true ]]; then
  step "Abhängigkeiten (pnpm audit)" pnpm audit --audit-level high
fi

ok "Alle Prüfungen bestanden"
