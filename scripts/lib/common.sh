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

# true, wenn pnpm als natives Binary läuft. Hat npm das Install-Script von pnpm
# übersprungen, läuft es langsamer über Node.js und meldet das bei jedem Aufruf.
pnpm_is_native() {
  ! pnpm --version 2>&1 | grep -q 'running through Node.js'
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

  # Abgeleitete Werte, damit Ports und Passwort nur an einer Stelle stehen.
  if [[ -z "${DATABASE_URL:-}" && -n "${POSTGRES_PASSWORD:-}" ]]; then
    export DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-localhost}:${POSTGRES_PORT}/${POSTGRES_DB}"
  fi
  if [[ -z "${VALKEY_URL:-}" && -n "${VALKEY_PORT:-}" ]]; then
    export VALKEY_URL="redis://localhost:${VALKEY_PORT}"
  fi
}

# true, wenn auf 127.0.0.1:<port> bereits etwas lauscht.
port_in_use() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
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

# Compose-Aufruf für die Produktion (infra/docker-compose.prod.yml).
compose_prod() {
  compose --project-name tbca \
    --env-file "$ROOT_DIR/.env.production" \
    --file "$ROOT_DIR/infra/docker-compose.prod.yml" "$@"
}

# Standardwerte je Profil; Einträge in .env.production haben Vorrang.
apply_profile_defaults() {
  case "${TBCA_PROFILE:-standard}" in
    compact)
      : "${API_UPSTREAM:=server:3000}" "${PG_SHARED_BUFFERS:=64MB}" "${PG_EFFECTIVE_CACHE_SIZE:=256MB}"
      : "${PG_WORK_MEM:=2MB}" "${PG_MAINTENANCE_WORK_MEM:=32MB}" "${PG_MAX_CONNECTIONS:=20}"
      : "${VALKEY_MAXMEMORY:=32mb}" "${NODE_MAX_OLD_SPACE:=256}"
      ;;
    standard)
      : "${API_UPSTREAM:=api:3000}"
      ;;
    *) die "Unbekanntes TBCA_PROFILE: ${TBCA_PROFILE} (standard oder compact)" ;;
  esac
  local name
  for name in API_UPSTREAM PG_SHARED_BUFFERS PG_EFFECTIVE_CACHE_SIZE PG_WORK_MEM PG_MAINTENANCE_WORK_MEM \
    PG_MAX_CONNECTIONS VALKEY_MAXMEMORY NODE_MAX_OLD_SPACE; do
    # Leere Werte entfernen, damit die Standardwerte aus Docker Compose greifen.
    if [[ -z "${!name:-}" ]]; then unset "$name"; else export "${name?}"; fi
  done
}

# Kurzer Git-Stand als Image-Tag.
git_tag() {
  git -C "$ROOT_DIR" rev-parse --short=12 HEAD 2>/dev/null || date +%Y%m%d%H%M%S
}
