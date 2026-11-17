import { Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { AuthModule } from '../auth/auth.module.js';
import { DrizzleCharacterRepository } from '../character/drizzle-character.repository.js';
import { DrizzleInventoryRepository } from '../inventory/drizzle-inventory.repository.js';
import {
  CHARACTER_REPOSITORY,
  DB_CONNECTION,
  ECONOMY_REPOSITORY,
  INVENTORY_REPOSITORY,
} from '../tokens.js';
import { DrizzleEconomyRepository } from './drizzle-economy.repository.js';
import { CraftingController, ShopController } from './economy.controller.js';
import { EconomyService } from './economy.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CraftingController, ShopController],
  providers: [
    EconomyService,
    {
      provide: ECONOMY_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleEconomyRepository(conn.db),
    },
    {
      provide: INVENTORY_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleInventoryRepository(conn.db),
    },
    {
      provide: CHARACTER_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleCharacterRepository(conn.db),
    },
  ],
})
export class EconomyModule {}
