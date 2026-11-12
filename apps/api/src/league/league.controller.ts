import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  leaderboardQuerySchema,
  type ChallengeResponse,
  type LeaderboardEntry,
  type LeagueDivisionView,
  type LeagueTickResult,
  type LeagueView,
} from '@tbca/shared';
import type { FastifyRequest } from 'fastify';

import { CsrfGuard, SessionGuard } from '../auth/guards.js';
import { parseBody } from '../common/api-error.js';
import { ServiceTokenGuard } from '../discord/service-token.guard.js';
import { LeagueService } from './league.service.js';

@Controller('league')
@UseGuards(SessionGuard, CsrfGuard)
export class LeagueController {
  constructor(@Inject(LeagueService) private readonly league: LeagueService) {}

  /** Rating, Anmeldung, eigene Division mit Tabelle und Spielplan. */
  @Get()
  view(@Req() req: FastifyRequest): Promise<LeagueView> {
    return this.league.view(req.auth!.accountId);
  }

  /** Tabelle und Spielplan einer Division (0 = oberste) des aktuellen Zyklus. */
  @Get('divisions/:index')
  division(
    @Req() req: FastifyRequest,
    @Param('index', new ParseIntPipe()) index: number,
  ): Promise<LeagueDivisionView> {
    return this.league.division(req.auth!.accountId, index);
  }

  @Post('join')
  @HttpCode(200)
  join(@Req() req: FastifyRequest): Promise<LeagueView> {
    return this.league.join(req.auth!.accountId, true);
  }

  @Post('leave')
  @HttpCode(200)
  leave(@Req() req: FastifyRequest): Promise<LeagueView> {
    return this.league.join(req.auth!.accountId, false);
  }

  /** Platzierungskampf gegen einen automatisch gewählten Gegner. */
  @Post('placement')
  @HttpCode(201)
  placement(@Req() req: FastifyRequest): Promise<ChallengeResponse> {
    return this.league.placement(req.auth!.accountId);
  }

  @Get('leaderboard')
  leaderboard(@Req() req: FastifyRequest, @Query() query: unknown): Promise<LeaderboardEntry[]> {
    const q = parseBody(leaderboardQuerySchema, query);
    return this.league.leaderboard(req.auth!.accountId, q.scope, q.limit);
  }
}

/** Worker: fällige Liga-Termine abarbeiten (Lock, Spieltag, Zyklus-Ende und -Start). */
@Controller('internal/jobs')
@UseGuards(ServiceTokenGuard)
export class LeagueJobsController {
  constructor(@Inject(LeagueService) private readonly league: LeagueService) {}

  @Post('league-tick')
  @HttpCode(200)
  tick(): Promise<LeagueTickResult> {
    return this.league.tick();
  }
}
