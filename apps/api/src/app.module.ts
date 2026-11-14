import { Module, type DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module.js';
import { CharacterModule } from './character/character.module.js';
import { ClockModule } from './clock/clock.module.js';
import { ConfigModule } from './config/config.module.js';
import type { Env } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { FightModule } from './fight/fight.module.js';
import { GameModule } from './game/game.module.js';
import { HealthModule } from './health/health.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot({ pinoHttp: loggerOptions(env) }),
        ClockModule,
        DbModule,
        HealthModule,
        AuthModule,
        GameModule,
        CharacterModule,
        FightModule,
      ],
    };
  }
}

/**
 * Strukturierte Logs mit pino. Protokolliert werden nur Methode, Pfad (ohne Query, die
 * z. B. OAuth-Codes enthält) und Status – keine IP-Adressen, Cookies oder Header.
 */
function loggerOptions(env: Env) {
  return {
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
    serializers: {
      req: (req: RawRequest) => ({ id: req.id, method: req.method, url: pathOf(req) }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      err: (err: Error) => ({ type: err.name, message: err.message }),
    },
    customLogLevel: (_req: unknown, res: { statusCode: number }, err?: Error) =>
      err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    autoLogging: { ignore: (req: RawRequest) => pathOf(req) === '/api/health' },
  };
}

interface RawRequest {
  id?: unknown;
  method?: string;
  url?: string;
  originalUrl?: string;
}

/** Pfad ohne Query; hinter Middleware ist `url` ggf. gekürzt, daher `originalUrl` zuerst. */
function pathOf(req: RawRequest): string {
  return (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
}
