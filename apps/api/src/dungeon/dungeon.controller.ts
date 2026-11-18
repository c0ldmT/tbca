import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { dungeonStartSchema, type DungeonView } from '@tbca/shared';
import type { FastifyRequest } from 'fastify';

import { CsrfGuard, SessionGuard } from '../auth/guards.js';
import { parseBody } from '../common/api-error.js';
import { DungeonService } from './dungeon.service.js';

@Controller('dungeon')
@UseGuards(SessionGuard, CsrfGuard)
export class DungeonController {
  constructor(@Inject(DungeonService) private readonly dungeon: DungeonService) {}

  @Get()
  status(@Req() req: FastifyRequest): Promise<DungeonView> {
    return this.dungeon.status(req.auth!.accountId);
  }

  @Post('start')
  @HttpCode(200)
  start(@Req() req: FastifyRequest, @Body() body: unknown): Promise<DungeonView> {
    return this.dungeon.start(req.auth!.accountId, parseBody(dungeonStartSchema, body));
  }

  @Post('continue')
  @HttpCode(200)
  continue(@Req() req: FastifyRequest): Promise<DungeonView> {
    return this.dungeon.continue(req.auth!.accountId);
  }

  @Post('heal')
  @HttpCode(200)
  heal(@Req() req: FastifyRequest): Promise<DungeonView> {
    return this.dungeon.heal(req.auth!.accountId);
  }

  @Post('leave')
  @HttpCode(200)
  leave(@Req() req: FastifyRequest): Promise<DungeonView> {
    return this.dungeon.leave(req.auth!.accountId);
  }
}
