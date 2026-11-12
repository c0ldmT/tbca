import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  challengeRequestSchema,
  trainingRequestSchema,
  type ChallengeResponse,
  type FightSummary,
  type FightView,
  type OpponentView,
  type PvpStatus,
} from '@tbca/shared';
import type { FastifyRequest } from 'fastify';

import { CsrfGuard, SessionGuard } from '../auth/guards.js';
import { parseBody } from '../common/api-error.js';
import { FightService } from './fight.service.js';

@Controller('pvp')
@UseGuards(SessionGuard, CsrfGuard)
export class PvpController {
  constructor(@Inject(FightService) private readonly fights: FightService) {}

  @Get('status')
  status(@Req() req: FastifyRequest): Promise<PvpStatus> {
    return this.fights.status(req.auth!.accountId);
  }

  /** Die Tagesgegner – eine kleine, täglich neue Auswahl. */
  @Get('opponents')
  opponents(@Req() req: FastifyRequest): Promise<OpponentView[]> {
    return this.fights.opponents(req.auth!.accountId);
  }

  /** Tagesgegner einmal am Tag gegen Credits neu würfeln. */
  @Post('opponents/reroll')
  @HttpCode(200)
  reroll(@Req() req: FastifyRequest): Promise<OpponentView[]> {
    return this.fights.rerollOpponents(req.auth!.accountId);
  }

  @Post('challenges')
  @HttpCode(201)
  challenge(@Req() req: FastifyRequest, @Body() body: unknown): Promise<ChallengeResponse> {
    return this.fights.challenge(req.auth!.accountId, parseBody(challengeRequestSchema, body));
  }

  /** Trainingskampf gegen einen Computer-Gegner frei wählbarer Klasse und Stufe. */
  @Post('training')
  @HttpCode(201)
  training(@Req() req: FastifyRequest, @Body() body: unknown): Promise<ChallengeResponse> {
    return this.fights.training(req.auth!.accountId, parseBody(trainingRequestSchema, body));
  }
}

@Controller('fights')
export class FightController {
  constructor(@Inject(FightService) private readonly fights: FightService) {}

  /** Eigene letzte Kämpfe. */
  @Get()
  @UseGuards(SessionGuard)
  recent(@Req() req: FastifyRequest): Promise<FightSummary[]> {
    return this.fights.recent(req.auth!.accountId);
  }

  /** Replay eines Kampfes; öffentlich, damit Links im Chat funktionieren. */
  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<FightView> {
    return this.fights.get(id);
  }
}
