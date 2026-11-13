import { Global, Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { DB_CONNECTION, SEASON_REPOSITORY } from '../tokens.js';
import { GameController } from './game.controller.js';
import { DrizzleSeasonRepository, SeasonService } from './season.js';

@Global()
@Module({
  controllers: [GameController],
  providers: [
    SeasonService,
    {
      provide: SEASON_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleSeasonRepository(conn.db),
    },
  ],
  exports: [SeasonService],
})
export class GameModule {}
