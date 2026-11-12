import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  leaderboardQuerySchema,
  teamLeagueJoinSchema,
  teamLeagueQuerySchema,
  type TeamLeaderboardEntry,
  type TeamLeagueView,
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
import { TeamLeagueService } from './team-league.service.js';

@Controller('league')
@UseGuards(SessionGuard, CsrfGuard)
export class LeagueController {
  constructor(
    @Inject(LeagueService) private readonly league: LeagueService,
    @Inject(TeamLeagueService) private readonly teamLeague: TeamLeagueService,
  ) {}

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

  /** Team-Rangliste einer Größe. */
  @Get('teams/leaderboard')
  teamLeaderboard(@Query() query: unknown): Promise<TeamLeaderboardEntry[]> {
    const { size } = parseBody(teamLeagueQuerySchema, query);
    const { limit } = parseBody(leaderboardQuerySchema, query);
    return this.teamLeague.leaderboard(size, limit);
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

/** Team-Liga eines Teams: Rating je Größe, Anmeldung (Kapitän), Division und Spielplan. */
@Controller('teams')
@UseGuards(SessionGuard, CsrfGuard)
export class TeamLeagueController {
  constructor(@Inject(TeamLeagueService) private readonly league: TeamLeagueService) {}

  @Get(':id/league')
  view(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ): Promise<TeamLeagueView> {
    return this.league.view(req.auth!.accountId, id, parseBody(teamLeagueQuerySchema, query).size);
  }

  @Post(':id/league')
  @HttpCode(200)
  join(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ): Promise<TeamLeagueView> {
    const { size, joined } = parseBody(teamLeagueJoinSchema, body);
    return this.league.join(req.auth!.accountId, id, size, joined);
  }
}
