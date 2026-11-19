import { Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { AuthModule } from '../auth/auth.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { CHARACTER_REPOSITORY, DB_CONNECTION } from '../tokens.js';
import { CharacterController } from './character.controller.js';
import { CharacterService } from './character.service.js';
import { DrizzleCharacterRepository } from './drizzle-character.repository.js';

@Module({
  imports: [AuthModule, InventoryModule],
  controllers: [CharacterController],
  providers: [
    CharacterService,
    {
      provide: CHARACTER_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleCharacterRepository(conn.db),
    },
  ],
  exports: [CharacterService],
})
export class CharacterModule {}
