import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { DbConnection } from '@tbca/db';
import { adminBotAgentSchema } from '@tbca/shared';
import type { FastifyRequest } from 'fastify';

import { DrizzleAdminRepository } from '../admin/drizzle-admin.repository.js';
import { AuthModule } from '../auth/auth.module.js';
import { CsrfGuard, SessionGuard, SuperadminGuard } from '../auth/guards.js';
import { CharacterModule } from '../character/character.module.js';
import { parseBody } from '../common/api-error.js';
import { ServiceTokenGuard } from '../discord/service-token.guard.js';
import { DungeonModule } from '../dungeon/dungeon.module.js';
import { FightModule } from '../fight/fight.module.js';
import { ADMIN_REPOSITORY, BOT_REPOSITORY, DB_CONNECTION } from '../tokens.js';
import { BotAgentService } from './bot-agent.service.js';
import { DrizzleBotRepository } from './bot.repository.js';

@Controller('admin/bots')
@UseGuards(SessionGuard, CsrfGuard, SuperadminGuard)
export class AdminBotsController {
  constructor(@Inject(BotAgentService) private readonly bots: BotAgentService) {}

  @Get()
  list() {
    return this.bots.list();
  }

  @Put(':id')
  setAgent(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.bots.setAgent(req.auth!.accountId, id, parseBody(adminBotAgentSchema, body).agent);
  }

  @Post('run')
  @HttpCode(200)
  run() {
    return this.bots.runAll();
  }
}

@Controller('internal/jobs')
@UseGuards(ServiceTokenGuard)
export class BotJobsController {
  constructor(@Inject(BotAgentService) private readonly bots: BotAgentService) {}

  @Post('bot-agents')
  @HttpCode(200)
  run() {
    return this.bots.runAll();
  }
}

@Module({
  imports: [AuthModule, CharacterModule, FightModule, DungeonModule],
  controllers: [AdminBotsController, BotJobsController],
  providers: [
    BotAgentService,
    ServiceTokenGuard,
    {
      provide: BOT_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleBotRepository(c.db),
    },
    {
      provide: ADMIN_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleAdminRepository(c.db),
    },
  ],
  exports: [BotAgentService],
})
export class BotsModule {}
