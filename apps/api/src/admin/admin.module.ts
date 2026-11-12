import { Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { AuthModule } from '../auth/auth.module.js';
import { BotsModule } from '../bots/bots.module.js';
import { DrizzleCharacterRepository } from '../character/drizzle-character.repository.js';
import { DiscordModule } from '../discord/discord.module.js';
import { DungeonModule } from '../dungeon/dungeon.module.js';
import { DrizzleEconomyRepository } from '../economy/drizzle-economy.repository.js';
import {
  ADMIN_EXPORT_REPOSITORY,
  ADMIN_REPOSITORY,
  CHARACTER_REPOSITORY,
  CONFIG_REPOSITORY,
  DB_CONNECTION,
  ECONOMY_REPOSITORY,
  SEASON_ADMIN_REPOSITORY,
} from '../tokens.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { DrizzleConfigRepository } from './config.repository.js';
import { ConfigService } from './config.service.js';
import { DrizzleAdminRepository } from './drizzle-admin.repository.js';
import { DrizzleExportRepository } from './drizzle-export.repository.js';
import { ExportService } from './export.service.js';
import { DrizzleSeasonAdminRepository } from './drizzle-season-admin.repository.js';
import { SeasonAdminController } from './season-admin.controller.js';
import { SeasonAdminService } from './season-admin.service.js';

@Module({
  imports: [AuthModule, DungeonModule, DiscordModule, BotsModule],
  controllers: [AdminController, SeasonAdminController],
  providers: [
    AdminService,
    ConfigService,
    SeasonAdminService,
    ExportService,
    {
      provide: ADMIN_EXPORT_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleExportRepository(c.db),
    },
    {
      provide: SEASON_ADMIN_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleSeasonAdminRepository(c.db),
    },
    {
      provide: CONFIG_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleConfigRepository(c.db),
    },
    {
      provide: ADMIN_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleAdminRepository(c.db),
    },
    {
      provide: CHARACTER_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleCharacterRepository(c.db),
    },
    {
      provide: ECONOMY_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleEconomyRepository(c.db),
    },
  ],
})
export class AdminModule {}
