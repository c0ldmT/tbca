import { Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import { AuthModule } from '../auth/auth.module.js';
import { CharacterModule } from '../character/character.module.js';
import { DrizzleCharacterRepository } from '../character/drizzle-character.repository.js';
import { FightModule } from '../fight/fight.module.js';
import { CHARACTER_REPOSITORY, DB_CONNECTION, DISCORD_REPOSITORY } from '../tokens.js';
import { DiscordController, PassiveXpJobController } from './discord.controller.js';
import { DiscordService } from './discord.service.js';
import { DrizzleDiscordRepository } from './drizzle-discord.repository.js';
import { ServiceTokenGuard } from './service-token.guard.js';

@Module({
  imports: [AuthModule, CharacterModule, FightModule],
  controllers: [DiscordController, PassiveXpJobController],
  providers: [
    DiscordService,
    ServiceTokenGuard,
    {
      provide: DISCORD_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleDiscordRepository(conn.db),
    },
    {
      provide: CHARACTER_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleCharacterRepository(conn.db),
    },
  ],
})
export class DiscordModule {}
