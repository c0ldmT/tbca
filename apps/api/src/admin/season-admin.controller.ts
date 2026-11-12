import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseEnumPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SEASON_JOB_IDS,
  adminDailyResetSchema,
  adminSeasonEndSchema,
  adminSeasonResetSchema,
  type SeasonJobId,
} from '@tbca/shared';
import type { FastifyRequest } from 'fastify';

import { CsrfGuard, SessionGuard, SuperadminGuard } from '../auth/guards.js';
import { parseBody } from '../common/api-error.js';
import { SeasonAdminService } from './season-admin.service.js';

/** Steuerung der laufenden Season im Admin-Bereich. */
@Controller('admin/season')
@UseGuards(SessionGuard, CsrfGuard, SuperadminGuard)
export class SeasonAdminController {
  constructor(@Inject(SeasonAdminService) private readonly season: SeasonAdminService) {}

  @Get()
  view() {
    return this.season.view();
  }

  @Post('daily-reset')
  @HttpCode(200)
  dailyReset(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.season.resetDaily(req.auth!.accountId, parseBody(adminDailyResetSchema, body));
  }

  @Post('jobs/:job')
  @HttpCode(200)
  job(
    @Req() req: FastifyRequest,
    @Param('job', new ParseEnumPipe(Object.fromEntries(SEASON_JOB_IDS.map((j) => [j, j]))))
    job: SeasonJobId,
  ) {
    return this.season.runJob(req.auth!.accountId, job);
  }

  @Put('end')
  setEnd(@Req() req: FastifyRequest, @Body() body: unknown) {
    const { endsAt } = parseBody(adminSeasonEndSchema, body);
    return this.season.setEnd(req.auth!.accountId, new Date(endsAt));
  }

  @Post('reset')
  @HttpCode(200)
  reset(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.season.reset(req.auth!.accountId, parseBody(adminSeasonResetSchema, body));
  }
}
