#!/usr/bin/env bash
# Baut die Produktions-Images (Server und Website).
#
#   scripts/build.sh                          für die eigene Plattform
#   scripts/build.sh --platform linux/arm64   z. B. für den Raspberry Pi (auf dem PC bauen)
#   scripts/build.sh --save tbca-images.tar.gz  zusätzlich als Datei zum Übertragen speichern
#   scripts/build.sh --push                   in die Registry unter TBCA_IMAGE_PREFIX schieben
#   scripts/build.sh --tag v0.1.0             eigenes Tag statt des Git-Stands

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

PLATFORM=""
SAVE=""
PUSH=false
TAG="$(git_tag)"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="$2"; shift 2 ;;
    --save) SAVE="$2"; shift 2 ;;
    --push) PUSH=true; shift ;;
    --tag) TAG="$2"; shift 2 ;;
    -h | --help) sed -n '2,10p' "$0"; exit 0 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done

cd "$ROOT_DIR" || exit 1
require_cmd docker "Docker mit Buildx wird zum Bauen benötigt."
PREFIX="${TBCA_IMAGE_PREFIX:-tbca}"

args=(buildx build)
[[ -n "$PLATFORM" ]] && args+=(--platform "$PLATFORM")
if [[ "$PUSH" == true ]]; then args+=(--push); else args+=(--load); fi

for image in server web; do
  info "Baue $PREFIX/$image:$TAG ${PLATFORM:+($PLATFORM)}"
  docker "${args[@]}" \
    --file "infra/docker/$image.Dockerfile" \
    --tag "$PREFIX/$image:$TAG" \
    --tag "$PREFIX/$image:latest" \
    .
done

if [[ -n "$SAVE" ]]; then
  info "Speichere Images nach $SAVE"
  docker save "$PREFIX/server:$TAG" "$PREFIX/web:$TAG" | gzip >"$SAVE"
  ok "Übertragen z. B. mit: scp $SAVE pi@raspberrypi:~/tbca/ und dort scripts/deploy.sh --load $(basename "$SAVE") --tag $TAG"
fi
ok "Images gebaut: Tag $TAG"
