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
import { adminAmountSchema, adminBanSchema, adminTimeSchema } from '@tbca/shared';
import type { FastifyRequest } from 'fastify';

import { CsrfGuard, SessionGuard, SuperadminGuard } from '../auth/guards.js';
import { parseBody } from '../common/api-error.js';
import { AdminService } from './admin.service.js';

@Controller('admin')
@UseGuards(SessionGuard, CsrfGuard, SuperadminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('time')
  time() {
    return this.admin.time();
  }

  @Put('time')
  setTime(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.admin.setTime(req.auth!.accountId, parseBody(adminTimeSchema, body));
  }

  @Get('accounts')
  accounts(@Query('q') q: unknown) {
    return this.admin.searchAccounts(typeof q === 'string' ? q : '');
  }

  @Post('accounts/:id/ban')
  @HttpCode(204)
  ban(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.admin.ban(req.auth!.accountId, id, parseBody(adminBanSchema, body).reason);
  }

  @Post('accounts/:id/xp')
  @HttpCode(200)
  xp(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const { amount, reason } = parseBody(adminAmountSchema, body);
    return this.admin.adjustXp(req.auth!.accountId, id, amount, reason);
  }

  @Post('accounts/:id/credits')
  @HttpCode(204)
  credits(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const { amount, reason } = parseBody(adminAmountSchema, body);
    return this.admin.adjustCredits(req.auth!.accountId, id, amount, reason);
  }

  @Get('audit')
  audit() {
    return this.admin.auditLog();
  }
}
