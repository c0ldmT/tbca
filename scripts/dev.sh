#!/usr/bin/env bash
# Lokale Entwicklung: Postgres und Valkey laufen in Docker, die Apps nativ mit Hot Reload.
#
#   scripts/dev.sh             Dienste starten, migrieren, Dev-Daten, alle Apps im Watch-Modus
#   scripts/dev.sh lan         wie oben, Website zusätzlich im Heimnetz erreichbar
#                              (Adresse: TBCA_LAN_HOST=<IP oder Name>, sonst automatisch)
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

# IPv4-Adressen dieses Rechners im lokalen Netz (ohne Loopback und Docker-Brücken).
lan_addresses() {
  local list=""
  if has_cmd ip; then
    list="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $2" "$4}' |
      grep -Ev '^(docker|br-|veth|virbr|cni|flannel)' | awk '{sub(/\/.*/, "", $2); print $2}' || true)"
  elif has_cmd ipconfig; then # macOS
    list="$(ipconfig getifaddr en0 2>/dev/null; ipconfig getifaddr en1 2>/dev/null)"
  fi
  printf '%s\n' "$list" | grep -E '^[0-9]+\.' | sort -u || true
}

is_wsl() { grep -qi microsoft /proc/version 2>/dev/null; }

# Website im Heimnetz freigeben: Dev-Server auf allen Schnittstellen, API erlaubt die
# LAN-Adressen als Origin und nutzt sie als Discord-Rücksprung.
prepare_lan() {
  local port="${WEB_PORT:-4200}" hosts=() origins=() h
  if [[ -n "${TBCA_LAN_HOST:-}" ]]; then
    IFS=',' read -r -a hosts <<<"${TBCA_LAN_HOST// /}"
  else
    mapfile -t hosts < <(lan_addresses)
  fi
  [[ ${#hosts[@]} -gt 0 ]] || die "Keine LAN-Adresse gefunden. Bitte TBCA_LAN_HOST=<IP> setzen."
  for h in "${hosts[@]}"; do origins+=("http://${h}:${port}"); done

  export TBCA_WEB_HOST=0.0.0.0
  local joined
  joined="$(IFS=,; printf '%s' "${origins[*]}")"
  export WEB_EXTRA_ORIGINS="${WEB_EXTRA_ORIGINS:+${WEB_EXTRA_ORIGINS},}${joined}"

  info "Website im Heimnetz:"
  for h in "${origins[@]}"; do printf '    %s\n' "$h"; done
  for h in "${hosts[@]}"; do
    if [[ ! "$h" =~ ^[0-9.]+$ ]]; then
      warn "Hostname $h: Der Dev-Server beantwortet nur IP-Adressen und localhost. Den Namen in
  apps/web/angular.json unter serve → options → allowedHosts eintragen oder die IP verwenden."
    fi
  done
  if [[ -n "${DISCORD_CLIENT_ID:-}" ]]; then
    info "Discord-Login: diese Redirects in der Discord-App (OAuth2 → Redirects) eintragen:"
    for h in "${origins[@]}"; do printf '    %s/api/auth/discord/callback\n' "$h"; done
    printf '    (der localhost-Redirect bleibt zusätzlich eingetragen)\n'
  fi
  if [[ "${DEV_LOGIN:-}" =~ ^(true|1)$ ]]; then
    info "Testzugang ohne Discord ist aktiv (DEV_LOGIN=true) – Anmeldung per Name auf der Startseite."
  else
    printf '    Ohne Discord testen: DEV_LOGIN=true in %s setzen.\n' "$(basename "$(env_file)")"
  fi
  if is_wsl; then
    warn "WSL erkannt: Geräte im Heimnetz erreichen WSL nur über Windows. Entweder in
  %UserProfile%\\.wslconfig unter [wsl2] networkingMode=mirrored setzen (Windows 11, danach
  'wsl --shutdown') oder Port ${port} weiterleiten (PowerShell als Admin):
    netsh interface portproxy add v4tov4 listenport=${port} listenaddress=0.0.0.0 connectport=${port} connectaddress=\$(wsl hostname -I)
  und in der Windows-Firewall eingehend TCP ${port} erlauben. TBCA_LAN_HOST=<Windows-IP> setzen,
  damit Login und Origin die Adresse kennen, die die anderen Geräte aufrufen."
  else
    printf '    Firewall: eingehend TCP %s erlauben (z. B. sudo ufw allow %s/tcp).\n' "$port" "$port"
  fi
}

case "${1:-all}" in
  lan)
    prepare_lan
    start_services
    "$ROOT_DIR/scripts/migrate.sh"
    "$ROOT_DIR/scripts/migrate.sh" seed
    info "Starte Apps im Heimnetz-Modus (Strg+C zum Beenden)"
    exec pnpm --recursive --parallel --if-present --stream run dev
    ;;
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
  -h | --help) sed -n '2,11p' "$0" ;;
  *) die "Unbekannter Befehl: $1 (siehe scripts/dev.sh --help)" ;;
esac
