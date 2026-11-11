import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ENGINE_VERSION, type Clock } from '@tbca/game-core';
import type { HealthResponse } from '@tbca/shared';
import type { FastifyReply } from 'fastify';

import type { DbPing } from '../db/db.module.js';
import { CLOCK, DB_PING } from '../tokens.js';

const PING_TIMEOUT_MS = 2000;

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB_PING) private readonly pingDb: DbPing,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Für Docker-Healthcheck und deploy.sh: 200 wenn alles läuft, sonst 503. */
  @Get()
  async check(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthResponse> {
    const database = await withTimeout(this.pingDb(), PING_TIMEOUT_MS).then(
      () => 'up' as const,
      () => 'down' as const,
    );
    const ok = database === 'up';
    reply.status(ok ? 200 : 503).header('cache-control', 'no-store');
    return {
      status: ok ? 'ok' : 'degraded',
      checks: { database },
      engineVersion: ENGINE_VERSION,
      time: new Date(this.clock.now()).toISOString(),
    };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
