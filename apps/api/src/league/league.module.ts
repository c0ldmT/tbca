import { Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { AuthModule } from '../auth/auth.module.js';
import { DrizzleCharacterRepository } from '../character/drizzle-character.repository.js';
import { DrizzleFightRepository } from '../fight/drizzle-fight.repository.js';
import { FightModule } from '../fight/fight.module.js';
import { DrizzleTeamRepository } from '../team/drizzle-team.repository.js';
import { TeamModule } from '../team/team.module.js';
import {
  CHARACTER_REPOSITORY,
  DB_CONNECTION,
  FIGHT_REPOSITORY,
  TEAM_REPOSITORY,
} from '../tokens.js';
import {
  LeagueController,
  LeagueJobsController,
  TeamLeagueController,
} from './league.controller.js';
import { LeagueService } from './league.service.js';
import { TeamLeagueService } from './team-league.service.js';

@Module({
  imports: [AuthModule, FightModule, TeamModule],
  controllers: [LeagueController, LeagueJobsController, TeamLeagueController],
  providers: [
    LeagueService,
    TeamLeagueService,
    {
      provide: TEAM_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleTeamRepository(c.db),
    },
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
  exports: [LeagueService, TeamLeagueService],
})
export class LeagueModule {}
