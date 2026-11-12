import { Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { AuthModule } from '../auth/auth.module.js';
import { DrizzleCharacterRepository } from '../character/drizzle-character.repository.js';
import { DrizzleFightRepository } from '../fight/drizzle-fight.repository.js';
import { FightModule } from '../fight/fight.module.js';
import { CHARACTER_REPOSITORY, DB_CONNECTION, FIGHT_REPOSITORY } from '../tokens.js';
import { LeagueController, LeagueJobsController } from './league.controller.js';
import { LeagueService } from './league.service.js';

@Module({
  imports: [AuthModule, FightModule],
  controllers: [LeagueController, LeagueJobsController],
  providers: [
    LeagueService,
    {
      provide: FIGHT_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleFightRepository(c.db),
    },
    {
      provide: CHARACTER_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleCharacterRepository(c.db),
    },
  ],
  exports: [LeagueService],
})
export class LeagueModule {}
