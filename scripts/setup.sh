#!/usr/bin/env bash
# Richtet die Arbeitskopie ein: pnpm, Abhängigkeiten und Umgebungsdatei.
#
#   scripts/setup.sh           Entwicklung (.env.development)
#   scripts/setup.sh --prod    Server (.env.production, nur Produktionsabhängigkeiten)
#   scripts/setup.sh --ci      wie Entwicklung, aber mit unverändertem Lockfile

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

MODE=development
FROZEN=false
for arg in "$@"; do
  case "$arg" in
    --prod) MODE=production FROZEN=true ;;
    --ci) FROZEN=true ;;
    -h | --help)
      sed -n '2,7p' "$0"
      exit 0
      ;;
    *) die "Unbekannte Option: $arg" ;;
  esac
done
export TBCA_ENV="$MODE"
cd "$ROOT_DIR" || exit 1

info "Prüfe Node.js"
require_node
ok "Node.js $(node -v)"

PNPM_VERSION="$(pnpm_version)"
if ! has_cmd pnpm || [[ "$(pnpm --version)" != "$PNPM_VERSION" ]]; then
  info "Installiere pnpm $PNPM_VERSION"
  npm install --global "pnpm@$PNPM_VERSION" >/dev/null ||
    die "pnpm konnte nicht installiert werden. Ggf. npm-Prefix prüfen (npm config get prefix)."
fi
ok "pnpm $(pnpm --version)"

info "Installiere Abhängigkeiten"
install_args=()
[[ "$FROZEN" == true ]] && install_args+=(--frozen-lockfile)
[[ "$MODE" == production ]] && install_args+=(--prod)
pnpm install "${install_args[@]}"

ENV_FILE="$(env_file)"
if [[ -f "$ENV_FILE" ]]; then
  ok "$(basename "$ENV_FILE") existiert bereits (unverändert)"
else
  info "Lege $(basename "$ENV_FILE") aus .env.example an"
  # Ersetzt jeden Platzhalter __SECRET__ durch einen eigenen Zufallswert
  # und setzt NODE_ENV passend zur Umgebung.
  # shellcheck disable=SC2016
  node -e '
    const fs = require("node:fs");
    const { randomBytes } = require("node:crypto");
    const [src, dst, mode] = process.argv.slice(1);
    const secret = () => randomBytes(32).toString("base64url");
    const pw = secret();
    const text = fs
      .readFileSync(src, "utf8")
      .replaceAll("__DB_PASSWORD__", pw)
      .replace(/__SECRET__/g, secret)
      .replace(/^NODE_ENV=.*$/m, `NODE_ENV=${mode}`);
    fs.writeFileSync(dst, text, { mode: 0o600 });
  ' "$ROOT_DIR/.env.example" "$ENV_FILE" "$MODE"
  ok "$(basename "$ENV_FILE") angelegt – Zugangsdaten (z. B. Discord-App) bitte ergänzen"
fi

if has_cmd docker; then
  ok "Docker gefunden"
else
  warn "Docker wurde nicht gefunden; scripts/dev.sh braucht es für Postgres und Valkey."
fi

ok "Fertig. Weiter mit: scripts/dev.sh"
