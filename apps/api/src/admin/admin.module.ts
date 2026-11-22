import { Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { AuthModule } from '../auth/auth.module.js';
import { DrizzleCharacterRepository } from '../character/drizzle-character.repository.js';
import { DrizzleEconomyRepository } from '../economy/drizzle-economy.repository.js';
import {
  ADMIN_REPOSITORY,
  CHARACTER_REPOSITORY,
  DB_CONNECTION,
  ECONOMY_REPOSITORY,
} from '../tokens.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { DrizzleAdminRepository } from './drizzle-admin.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [
    AdminService,
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
