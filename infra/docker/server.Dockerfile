# syntax=docker/dockerfile:1.7
# API, Discord-Bot und kombinierter Server in einem Image; der Befehl wählt den Dienst.
# Gebaut wird auf der Build-Plattform (schnell, auch für arm64), weil TypeScript-Ausgabe und
# Abhängigkeiten plattformunabhängig sind (keine nativen Module).

ARG NODE_VERSION=24.11.1
ARG PNPM_VERSION=12.16.1

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS build
ARG PNPM_VERSION
RUN npm install --global --ignore-scripts=false "pnpm@${PNPM_VERSION}"
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --recursive --filter '!@tbca/web' run build \
 # Nur Laufzeit-Abhängigkeiten behalten; die Website wird separat gebaut.
 && rm -rf apps/web node_modules apps/*/node_modules packages/*/node_modules \
 && pnpm install --prod --frozen-lockfile --filter '@tbca/server...' --filter '@tbca/db'

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo /app
USER node
EXPOSE 3000
# Standard: API. Andere Dienste über `command` in Docker Compose.
CMD ["node", "apps/api/dist/main.js"]
