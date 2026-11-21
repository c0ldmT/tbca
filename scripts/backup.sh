#!/usr/bin/env bash
# Datenbank-Backups (Produktion, mit TBCA_ENV=development auch lokal).
#
#   scripts/backup.sh                  Backup nach backups/, ältere über BACKUP_KEEP hinaus löschen
#   scripts/backup.sh list             vorhandene Backups anzeigen
#   scripts/backup.sh restore DATEI    Backup einspielen (überschreibt die Datenbank, fragt nach)

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

export TBCA_ENV="${TBCA_ENV:-production}"
cd "$ROOT_DIR" || exit 1
load_env
BACKUP_DIR="$ROOT_DIR/backups"
mkdir -p "$BACKUP_DIR"

db() {
  if [[ "$(tbca_env)" == production ]]; then compose_prod "$@"; else compose_dev "$@"; fi
}

case "${1:-create}" in
  create)
    file="$BACKUP_DIR/tbca-$(date +%Y%m%d-%H%M%S).dump"
    info "Sichere Datenbank nach $(basename "$file")"
    db exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom >"$file" ||
      { rm -f "$file"; die "Backup fehlgeschlagen"; }
    [[ -s "$file" ]] || { rm -f "$file"; die "Backup ist leer"; }
    keep="${BACKUP_KEEP:-14}"
    # Dateinamen enthalten den Zeitstempel: alphabetisch = chronologisch.
    shopt -s nullglob
    all=("$BACKUP_DIR"/tbca-*.dump)
    if ((${#all[@]} > keep)); then
      old=("${all[@]:0:${#all[@]}-keep}")
      rm -f -- "${old[@]}"
      info "${#old[@]} ältere Backups gelöscht"
    fi
    ok "Backup: $file ($(du -h "$file" | cut -f1))"
    ;;
  list) ls -1lh "$BACKUP_DIR"/tbca-*.dump 2>/dev/null || info "Keine Backups vorhanden" ;;
  restore)
    file="${2:-}"
    [[ -f "$file" ]] || die "Datei nicht gefunden: $file"
    read -r -p "Datenbank mit $(basename "$file") überschreiben? Laufende Dienste werden kurz gestoppt. [j/N] " answer
    [[ "$answer" =~ ^[jJyY]$ ]] || exit 0
    if [[ "$(tbca_env)" == production ]]; then compose_prod stop api bot-discord server 2>/dev/null || true; fi
    db exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner <"$file"
    if [[ "$(tbca_env)" == production ]]; then
      apply_profile_defaults
      compose_prod --profile "${TBCA_PROFILE:-standard}" up -d
    fi
    ok "Backup eingespielt"
    ;;
  -h | --help) sed -n '2,7p' "$0" ;;
  *) die "Unbekannter Befehl: $1 (siehe scripts/backup.sh --help)" ;;
esac
