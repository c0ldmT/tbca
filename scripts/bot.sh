#!/usr/bin/env bash
# Discord-Bot.
#
#   scripts/bot.sh register-commands   Slash-Commands bei Discord registrieren
#                                      (mit DISCORD_DEV_GUILD_ID nur auf diesem Server, sofort sichtbar)
#
# Der Bot selbst startet mit scripts/dev.sh, sobald DISCORD_BOT_TOKEN gesetzt ist.

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

cd "$ROOT_DIR" || exit 1
load_env

case "${1:-}" in
  register-commands)
    [[ -n "${DISCORD_BOT_TOKEN:-}" && -n "${DISCORD_CLIENT_ID:-}" ]] ||
      die "DISCORD_BOT_TOKEN und DISCORD_CLIENT_ID in $(basename "$(env_file)") setzen."
    pnpm --filter @tbca/bot-discord run --silent register-commands
    ;;
  -h | --help | "") sed -n '2,8p' "$0" ;;
  *) die "Unbekannter Befehl: $1 (siehe scripts/bot.sh --help)" ;;
esac
