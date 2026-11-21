# syntax=docker/dockerfile:1.7
# Website als statische Dateien hinter Caddy (HTTPS, Sicherheits-Header, Proxy zur API).

ARG NODE_VERSION=24.11.1
ARG PNPM_VERSION=12.16.1
ARG CADDY_VERSION=2.10.2

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS build
ARG PNPM_VERSION
RUN npm install --global --ignore-scripts=false "pnpm@${PNPM_VERSION}"
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter '@tbca/web...' \
 && pnpm --filter @tbca/web run build

FROM caddy:${CADDY_VERSION}-alpine AS runtime
COPY --from=build /repo/apps/web/dist/web/browser /srv
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
