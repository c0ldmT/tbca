import { Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { AuthModule } from '../auth/auth.module.js';
import { DrizzleCharacterRepository } from '../character/drizzle-character.repository.js';
import { DrizzleEconomyRepository } from '../economy/drizzle-economy.repository.js';
import {
  CHARACTER_REPOSITORY,
  DB_CONNECTION,
  ECONOMY_REPOSITORY,
  INVENTORY_REPOSITORY,
} from '../tokens.js';
import { DrizzleInventoryRepository } from './drizzle-inventory.repository.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    {
      provide: INVENTORY_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleInventoryRepository(conn.db),
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
  exports: [InventoryService],
})
export class InventoryModule {}
