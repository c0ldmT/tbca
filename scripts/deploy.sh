#!/usr/bin/env bash
# Deployment auf dem Server (VPS oder Raspberry Pi), im Repo-Verzeichnis ausgeführt.
#
#   scripts/deploy.sh --build                 Images hier bauen und ausrollen (VPS)
#   scripts/deploy.sh --load DATEI --tag TAG  mit scripts/build.sh --save gebaute Images laden (Pi)
#   scripts/deploy.sh --tag TAG               vorhandene Images mit diesem Tag ausrollen
#   scripts/deploy.sh --rollback              zur zuletzt erfolgreich ausgerollten Version zurück
#
# Ablauf: Backup → Migrationen → Start → Healthcheck. Schlägt der Healthcheck fehl, läuft
# automatisch wieder die vorherige Version. Migrationen sind nur vorwärts gerichtet; bei Bedarf
# stellt scripts/backup.sh restore den Stand vor dem Deployment wieder her.

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

BUILD=false
LOAD=""
TAG=""
ROLLBACK=false
BACKUP=true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --build) BUILD=true; shift ;;
    --load) LOAD="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --rollback) ROLLBACK=true; shift ;;
    --no-backup) BACKUP=false; shift ;;
    -h | --help) sed -n '2,13p' "$0"; exit 0 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done

export TBCA_ENV=production
cd "$ROOT_DIR" || exit 1
require_cmd docker "Docker wird für das Deployment benötigt."
load_env
[[ -n "${TBCA_DOMAIN:-}" ]] || die "TBCA_DOMAIN fehlt in .env.production."
apply_profile_defaults
PROFILE="${TBCA_PROFILE:-standard}"
STATE_FILE="$ROOT_DIR/.deployed"
PREVIOUS="$(cat "$STATE_FILE" 2>/dev/null || true)"
SERVICE=$([[ "$PROFILE" == compact ]] && echo server || echo api)

if [[ "$ROLLBACK" == true ]]; then
  [[ -n "$PREVIOUS" ]] || die "Keine frühere Version bekannt."
  TAG="$PREVIOUS"
  BACKUP=false
fi

if [[ -n "$LOAD" ]]; then
  info "Lade Images aus $LOAD"
  gunzip -c "$LOAD" | docker load
fi
if [[ "$BUILD" == true ]]; then
  TAG="${TAG:-$(git_tag)}"
  "$ROOT_DIR/scripts/build.sh" --tag "$TAG"
fi
[[ -n "$TAG" ]] || die "Kein Tag angegeben (--build, --tag oder --rollback)."
export TBCA_VERSION="$TAG"

wait_healthy() {
  local id status
  for _ in $(seq 1 60); do
    id="$(compose_prod --profile "$PROFILE" ps -q "$SERVICE")"
    status="$([[ -n "$id" ]] && docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo starting)"
    [[ "$status" == healthy ]] && return 0
    [[ "$status" == unhealthy ]] && return 1
    sleep 2
  done
  return 1
}

if [[ "$BACKUP" == true ]] && [[ -n "$(compose_prod ps -q postgres 2>/dev/null)" ]]; then
  "$ROOT_DIR/scripts/backup.sh"
fi

info "Starte Datenbank und Valkey"
compose_prod up -d --wait postgres valkey
info "Führe Migrationen aus ($TAG)"
compose_prod --profile tools run --rm migrate
info "Rolle Version $TAG aus (Profil $PROFILE)"
compose_prod --profile "$PROFILE" up -d --remove-orphans

if wait_healthy; then
  echo "$TAG" >"$STATE_FILE"
  ok "Version $TAG läuft unter https://$TBCA_DOMAIN"
  exit 0
fi

warn "Healthcheck fehlgeschlagen."
compose_prod --profile "$PROFILE" logs --tail 50 "$SERVICE" >&2 || true
if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$TAG" ]]; then
  warn "Rollback auf $PREVIOUS"
  export TBCA_VERSION="$PREVIOUS"
  compose_prod --profile "$PROFILE" up -d --remove-orphans
  wait_healthy && warn "Vorherige Version $PREVIOUS läuft wieder. Datenbank ggf. mit scripts/backup.sh restore zurücksetzen."
fi
die "Deployment von $TAG fehlgeschlagen."
