import { Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { AuthModule } from '../auth/auth.module.js';
import { DrizzleCharacterRepository } from '../character/drizzle-character.repository.js';
import { DrizzleFightRepository } from '../fight/drizzle-fight.repository.js';
import {
  CHARACTER_REPOSITORY,
  ADMIN_REPOSITORY,
  DB_CONNECTION,
  FIGHT_REPOSITORY,
  TEAM_REPOSITORY,
} from '../tokens.js';
import { DrizzleAdminRepository } from '../admin/drizzle-admin.repository.js';
import { DrizzleTeamRepository } from './drizzle-team.repository.js';
import { CommunityController, TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CommunityController, TeamController],
  providers: [
    TeamService,
    {
      provide: ADMIN_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleAdminRepository(c.db),
    },
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
  exports: [TeamService],
})
export class TeamModule {}
