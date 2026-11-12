import { Global, Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { DrizzleCharacterRepository } from '../character/drizzle-character.repository.js';
import { CHARACTER_REPOSITORY, DB_CONNECTION } from '../tokens.js';
import { ProgressionService } from './progression.service.js';

@Global()
@Module({
  providers: [
    ProgressionService,
    {
      provide: CHARACTER_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleCharacterRepository(conn.db),
    },
  ],
  exports: [ProgressionService],
})
export class ProgressionModule {}
