import 'reflect-metadata';

import fastifyCookie from '@fastify/cookie';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { registerSecurityHeaders } from './common/security-headers.js';
import type { Env } from './config/env.js';

export const API_PREFIX = 'api';

export function createFastifyAdapter(env: Env): FastifyAdapter {
  return new FastifyAdapter({ trustProxy: env.TRUST_PROXY, bodyLimit: 1024 * 1024 });
}

/** Gemeinsame Einrichtung für Server und Tests: Präfix, Cookies, Sicherheits-Header. */
export async function configureApp(app: NestFastifyApplication, env: Env): Promise<void> {
  app.setGlobalPrefix(API_PREFIX);
  await app.register(fastifyCookie, { secret: env.COOKIE_SECRET });
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
  await configureApp(app, env);
  app.enableShutdownHooks();
  return app;
}
