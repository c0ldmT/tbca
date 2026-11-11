#!/usr/bin/env bash
# Gemeinsame Hilfsfunktionen für alle Scripts. Wird per `source` eingebunden.
# Läuft unter Linux, macOS und Windows (WSL2).

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export ROOT_DIR

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m' C_CYAN=$'\033[36m' C_YELLOW=$'\033[33m' C_RED=$'\033[31m' C_GREEN=$'\033[32m'
else
  C_RESET='' C_CYAN='' C_YELLOW='' C_RED='' C_GREEN=''
fi

info() { printf '%s▸%s %s\n' "$C_CYAN" "$C_RESET" "$*"; }
ok() { printf '%s✔%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die() {
  printf '%s✘%s %s\n' "$C_RED" "$C_RESET" "$*" >&2
  exit 1
}

has_cmd() { command -v "$1" >/dev/null 2>&1; }
require_cmd() { has_cmd "$1" || die "'$1' wurde nicht gefunden. ${2:-}"; }

# Prüft, ob die laufende Node-Version mindestens <major>.<minor>.<patch> ist.
require_node() {
  local min="${1:-22.22.3}"
  require_cmd node "Bitte Node.js installieren (siehe .nvmrc)."
  # shellcheck disable=SC2016
  node -e '
    const [a, b] = [process.versions.node, process.argv[1]].map((v) => v.split(".").map(Number));
    for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) process.exit(a[i] > b[i] ? 0 : 1); }
  ' "$min" || die "Node.js $(node -v) ist zu alt, benötigt wird mindestens v$min."
}

# Die in package.json festgelegte pnpm-Version.
pnpm_version() {
  node -p 'require(process.argv[1]).packageManager.split("@")[1]' "$ROOT_DIR/package.json"
}

# Umgebung: TBCA_ENV=development (Standard) oder production.
tbca_env() { printf '%s' "${TBCA_ENV:-development}"; }
env_file() { printf '%s/.env.%s' "$ROOT_DIR" "$(tbca_env)"; }

# Lädt .env.<umgebung> in die aktuelle Shell und exportiert alle Variablen.
load_env() {
  local file
  file="$(env_file)"
  [[ -f "$file" ]] || die "$file fehlt. Bitte zuerst scripts/setup.sh ausführen."
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

# docker compose (v2) oder das ältere docker-compose.
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif has_cmd docker-compose; then
    docker-compose "$@"
  else
    die "Docker Compose wurde nicht gefunden. Unter Windows: Docker Desktop mit WSL2-Integration."
  fi
}

# Compose-Aufruf für die Entwicklungsdienste (Postgres, Valkey).
compose_dev() {
  compose --project-name tbca-dev \
    --env-file "$(env_file)" \
    --file "$ROOT_DIR/infra/docker-compose.dev.yml" "$@"
}
