import { Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { AuthModule } from '../auth/auth.module.js';
import { DrizzleCharacterRepository } from '../character/drizzle-character.repository.js';
import {
  CHARACTER_REPOSITORY,
  DB_CONNECTION,
  FIGHT_REPOSITORY,
  PVP_REPOSITORY,
} from '../tokens.js';
import { DrizzlePvpRepository } from './drizzle-pvp.repository.js';
import { DrizzleFightRepository } from './drizzle-fight.repository.js';
import { FightController, PvpController } from './fight.controller.js';
import { FightService } from './fight.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PvpController, FightController],
  providers: [
    FightService,
    {
      provide: FIGHT_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleFightRepository(conn.db),
    },
    {
      provide: PVP_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzlePvpRepository(conn.db),
    },
    {
      provide: CHARACTER_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleCharacterRepository(conn.db),
    },
  ],
  exports: [FightService, PVP_REPOSITORY],
})
export class FightModule {}
