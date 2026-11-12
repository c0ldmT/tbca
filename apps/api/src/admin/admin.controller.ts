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
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  adminAmountSchema,
  adminDataExportQuery,
  adminBanSchema,
  adminConfigDraftSchema,
  adminConfigUpdateSchema,
  adminTimeSchema,
  adminSimulationReportSchema,
  adminSimulationSchema,
} from '@tbca/shared';
import type { SeasonConfigData } from '@tbca/db';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { CsrfGuard, SessionGuard, SuperadminGuard } from '../auth/guards.js';
import { parseBody } from '../common/api-error.js';
import { AdminService } from './admin.service.js';
import { ConfigService } from './config.service.js';
import { ExportService } from './export.service.js';

@Controller('admin')
@UseGuards(SessionGuard, CsrfGuard, SuperadminGuard)
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
    @Inject(ConfigService) private readonly configs: ConfigService,
    @Inject(ExportService) private readonly exports: ExportService,
  ) {}

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

  /** Anonymisierter Datenexport (JSON) für Balancing-Auswertungen. */
  @Get('export')
  async dataExport(
    @Req() req: FastifyRequest,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const doc = await this.exports.export(
      req.auth!.accountId,
      parseBody(adminDataExportQuery, query),
    );
    reply
      .header('cache-control', 'no-store')
      .header('content-disposition', `attachment; filename="tbca-data-${doc.season.day}.json"`);
    return doc;
  }

  @Get('audit')
  audit() {
    return this.admin.auditLog();
  }

  @Get('config')
  configList() {
    return this.configs.list();
  }

  @Get('config/:version')
  config(@Param('version', ParseIntPipe) version: number) {
    return this.configs.get(version);
  }

  @Post('config/drafts')
  @HttpCode(201)
  draft(@Req() req: FastifyRequest, @Body() body: unknown) {
    const { from, notes } = parseBody(adminConfigDraftSchema, body);
    return this.configs.createDraft(req.auth!.accountId, from, notes);
  }

  @Put('config/:version')
  updateConfig(
    @Req() req: FastifyRequest,
    @Param('version', ParseIntPipe) version: number,
    @Body() body: unknown,
  ) {
    const { data, notes } = parseBody(adminConfigUpdateSchema, body);
    return this.configs.update(
      req.auth!.accountId,
      version,
      data as unknown as SeasonConfigData,
      notes,
    );
  }

  /** Balancing-Simulation gegen eine Konfigurationsversion (Abschnitt 14). */
  @Post('simulations')
  @HttpCode(200)
  simulate(@Body() body: unknown) {
    return this.configs.simulate(parseBody(adminSimulationSchema, body));
  }

  /** Balancing-Report über mehrere Stufen, zum Herunterladen und Auswerten. */
  @Post('simulations/report')
  @HttpCode(200)
  simulationReport(@Body() body: unknown) {
    return this.configs.report(parseBody(adminSimulationReportSchema, body));
  }

  @Post('config/:version/publish')
  @HttpCode(200)
  publish(@Req() req: FastifyRequest, @Param('version', ParseIntPipe) version: number) {
    return this.configs.publish(req.auth!.accountId, version);
  }
}
