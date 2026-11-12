import { Global, Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { DB_CONNECTION, LEAGUE_REPOSITORY } from '../tokens.js';
import { DrizzleLeagueRepository } from './drizzle-league.repository.js';
import { RatingService } from './rating.service.js';

/** Rating für alle Module, die gewertete Kämpfe austragen. */
@Global()
@Module({
  providers: [
    RatingService,
    {
      provide: LEAGUE_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleLeagueRepository(c.db),
    },
  ],
  exports: [RatingService, LEAGUE_REPOSITORY],
})
export class RatingModule {}
