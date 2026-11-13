#!/usr/bin/env bash
# Lokale Entwicklung: Postgres und Valkey laufen in Docker, die Apps nativ mit Hot Reload.
#
#   scripts/dev.sh             Dienste starten, migrieren, Dev-Daten, alle Apps im Watch-Modus
#   scripts/dev.sh services    nur Postgres und Valkey starten
#   scripts/dev.sh down        Dienste stoppen (Daten bleiben erhalten)
#   scripts/dev.sh reset       Dienste stoppen und alle lokalen Daten löschen
#   scripts/dev.sh logs        Logs der Dienste verfolgen

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

export TBCA_ENV=development
cd "$ROOT_DIR" || exit 1
load_env

# Bricht mit einer klaren Meldung ab, wenn ein fremder Dienst den Port belegt.
ensure_port_free() {
  local service="$1" port="$2" variable="$3"
  if [[ -n "$(compose_dev ps --quiet --status running "$service" 2>/dev/null)" ]]; then
    return 0 # unser eigener Container läuft bereits
  fi
  if port_in_use "$port"; then
    die "Port $port ($service) ist schon belegt, vermutlich durch ein lokal installiertes $service
  oder einen Container eines anderen Projekts. Prüfen mit:
    sudo ss -ltnp 'sport = :$port'   oder   docker ps --filter publish=$port
  Lösung: in $(basename "$(env_file)") einen freien Port setzen, z. B. $variable=$((port + 1))"
  fi
}

start_services() {
  require_cmd docker "Docker wird für Postgres und Valkey benötigt."
  ensure_port_free postgres "$POSTGRES_PORT" POSTGRES_PORT
  ensure_port_free valkey "$VALKEY_PORT" VALKEY_PORT
  info "Starte Postgres und Valkey"
  compose_dev up --detach --wait
  ok "Dienste laufen (Postgres :${POSTGRES_PORT}, Valkey :${VALKEY_PORT})"
}

case "${1:-all}" in
  all)
    start_services
    "$ROOT_DIR/scripts/migrate.sh"
    # Dev-Season, Konfiguration und Dev-Community; idempotent, ändert vorhandene Daten nicht.
    "$ROOT_DIR/scripts/migrate.sh" seed
    info "Starte Apps (Strg+C zum Beenden; Dienste laufen weiter, Stopp mit: scripts/dev.sh down)"
    exec pnpm --recursive --parallel --if-present --stream run dev
    ;;
  services) start_services ;;
  down) compose_dev down ;;
  reset)
    read -r -p "Alle lokalen Entwicklungsdaten löschen? [j/N] " answer
    [[ "$answer" =~ ^[jJyY]$ ]] || exit 0
    compose_dev down --volumes
    ;;
  logs) compose_dev logs --follow ;;
  -h | --help) sed -n '2,9p' "$0" ;;
  *) die "Unbekannter Befehl: $1 (siehe scripts/dev.sh --help)" ;;
esac
