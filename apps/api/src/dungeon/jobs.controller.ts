import { Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';
import { session } from '@tbca/db';
import { lt } from 'drizzle-orm';

import { ServiceTokenGuard } from '../discord/service-token.guard.js';
import { DB_CONNECTION } from '../tokens.js';
import { DungeonService } from './dungeon.service.js';

/**
 * Interne Endpunkte für den Worker. Die Spiellogik bleibt in der API; der Worker plant und
 * stößt nur an (Spezifikation, Abschnitt 15).
 */
@Controller('internal/jobs')
@UseGuards(ServiceTokenGuard)
export class JobsController {
  constructor(
    @Inject(DungeonService) private readonly dungeon: DungeonService,
    @Inject(DB_CONNECTION) private readonly conn: DbConnection,
  ) {}

  @Post('expire-dungeon-runs')
  @HttpCode(200)
  async expireDungeonRuns(): Promise<{ expired: number }> {
    return { expired: await this.dungeon.expireIdleRuns() };
  }

  @Post('cleanup-sessions')
  @HttpCode(200)
  async cleanupSessions(): Promise<{ deleted: number }> {
    const result = await this.conn.db.delete(session).where(lt(session.expiresAt, new Date()));
    return { deleted: result.rowCount ?? 0 };
  }
}
