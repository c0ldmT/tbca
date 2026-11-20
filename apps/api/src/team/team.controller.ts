import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  createTeamSchema,
  joinTeamSchema,
  kickSchema,
  teamChallengeSchema,
  teamSettingsSchema,
} from '@tbca/shared';
import type { FastifyRequest } from 'fastify';

import { CsrfGuard, SessionGuard } from '../auth/guards.js';
import { parseBody } from '../common/api-error.js';
import { TeamService } from './team.service.js';

@Controller('communities')
@UseGuards(SessionGuard, CsrfGuard)
export class CommunityController {
  constructor(@Inject(TeamService) private readonly teams: TeamService) {}

  @Get()
  list(@Req() req: FastifyRequest) {
    return this.teams.communities(req.auth!.accountId);
  }

  @Post(':id/join')
  @HttpCode(200)
  join(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.teams.joinCommunity(req.auth!.accountId, id);
  }
}

@Controller('teams')
@UseGuards(SessionGuard, CsrfGuard)
export class TeamController {
  constructor(@Inject(TeamService) private readonly teams: TeamService) {}

  @Get('mine')
  mine(@Req() req: FastifyRequest) {
    return this.teams.mine(req.auth!.accountId);
  }

  @Get()
  search(@Query('q') q: unknown) {
    return this.teams.search(typeof q === 'string' ? q : '');
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.teams.create(req.auth!.accountId, parseBody(createTeamSchema, body));
  }

  @Post('join')
  @HttpCode(200)
  join(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.teams.join(req.auth!.accountId, parseBody(joinTeamSchema, body).code);
  }

  @Post(':id/leave')
  @HttpCode(200)
  leave(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.teams.leave(req.auth!.accountId, id);
  }

  @Post(':id/kick')
  @HttpCode(200)
  kick(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.teams.kick(req.auth!.accountId, id, parseBody(kickSchema, body).accountId);
  }

  @Put(':id/settings')
  settings(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.teams.settings(req.auth!.accountId, id, parseBody(teamSettingsSchema, body));
  }

  @Post(':id/challenge')
  @HttpCode(201)
  challenge(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.teams.challenge(req.auth!.accountId, id, parseBody(teamChallengeSchema, body));
  }
}
