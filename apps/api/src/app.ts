import 'reflect-metadata';

import { createHash } from 'node:crypto';

import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { HttpStatus } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Valkey } from 'iovalkey';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { ApiError } from './common/api-error.js';
import { registerSecurityHeaders } from './common/security-headers.js';
import type { Env } from './config/env.js';

export const API_PREFIX = 'api';

export function createFastifyAdapter(env: Env): FastifyAdapter {
  return new FastifyAdapter({ trustProxy: env.TRUST_PROXY, bodyLimit: 1024 * 1024 });
}

export interface ConfigureOptions {
  /** Gemeinsamer Zähler für Rate-Limits über mehrere Prozesse; ohne gilt ein lokaler Speicher. */
  rateLimitStore?: Valkey;
}

/** Gemeinsame Einrichtung für Server und Tests: Präfix, Cookies, Rate-Limits, Sicherheits-Header. */
export async function configureApp(
  app: NestFastifyApplication,
  env: Env,
  options: ConfigureOptions = {},
): Promise<void> {
  app.setGlobalPrefix(API_PREFIX);
  await app.register(fastifyCookie, { secret: env.COOKIE_SECRET });
  if (env.RATE_LIMIT_PER_MINUTE > 0) {
    await app.register(fastifyRateLimit, {
      global: true,
      max: (request) =>
        request.url.startsWith(`/${API_PREFIX}/auth/discord`)
          ? env.RATE_LIMIT_AUTH_PER_MINUTE
          : env.RATE_LIMIT_PER_MINUTE,
      timeWindow: 60_000,
      // Angemeldete zählen je Session (≈ Account), alle anderen je IP.
      keyGenerator: (request) => {
        const session = Object.entries(request.cookies ?? {}).find(([name]) =>
          name.endsWith('tbca_session'),
        )?.[1];
        return session
          ? `s:${createHash('sha256').update(session).digest('hex').slice(0, 24)}`
          : `ip:${request.ip}`;
      },
      // Healthchecks und die per Token geschützte Bot-API zählen nicht.
      allowList: (request) =>
        request.url.startsWith(`/${API_PREFIX}/health`) ||
        request.url.startsWith(`/${API_PREFIX}/internal/`),
      // Als HttpException, damit Nest das einheitliche Fehlerformat mit `code` ausliefert.
      errorResponseBuilder: (_request, context) =>
        new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', 'Zu viele Anfragen', {
          retryAfterSeconds: Math.ceil(context.ttl / 1000),
        }),
      // Fällt Valkey aus, lieber ohne Limit weiterlaufen als alle Anfragen abzulehnen.
      skipOnError: true,
      ...(options.rateLimitStore ? { redis: options.rateLimitStore, nameSpace: 'tbca:rl:' } : {}),
    });
  }
  registerSecurityHeaders(app.getHttpAdapter().getInstance(), { hsts: env.COOKIE_SECURE });
}

/**
 * Erzeugt die API als eigenständig startbares Modul. Im Sparprofil (Raspberry Pi) können
 * später api, worker und Bots in einem Prozess gestartet werden.
 */
export async function createApiApp(env: Env): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    createFastifyAdapter(env),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  const rateLimitStore = new Valkey(env.VALKEY_URL, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });
  rateLimitStore.on('error', () => undefined); // Ausfälle meldet der Healthcheck, nicht jede Anfrage
  await configureApp(app, env, { rateLimitStore });
  app.enableShutdownHooks();
  return app;
}
