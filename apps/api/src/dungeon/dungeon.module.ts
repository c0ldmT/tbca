import { Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { AuthModule } from '../auth/auth.module.js';
import { DrizzleCharacterRepository } from '../character/drizzle-character.repository.js';
import { DrizzleEconomyRepository } from '../economy/drizzle-economy.repository.js';
import {
  CHARACTER_REPOSITORY,
  DB_CONNECTION,
  DUNGEON_REPOSITORY,
  ECONOMY_REPOSITORY,
} from '../tokens.js';
import { DungeonController } from './dungeon.controller.js';
import { JobsController } from './jobs.controller.js';
import { ServiceTokenGuard } from '../discord/service-token.guard.js';
import { DungeonService } from './dungeon.service.js';
import { DrizzleDungeonRepository } from './drizzle-dungeon.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [DungeonController, JobsController],
  providers: [
    DungeonService,
    ServiceTokenGuard,
    {
      provide: DUNGEON_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleDungeonRepository(conn.db),
    },
    {
      provide: ECONOMY_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleEconomyRepository(conn.db),
    },
    {
      provide: CHARACTER_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleCharacterRepository(conn.db),
    },
  ],
  exports: [DungeonService],
})
export class DungeonModule {}
