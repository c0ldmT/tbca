import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Module,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { DbConnection } from '@tbca/db';
import { accountDeleteSchema, accountSettingsSchema } from '@tbca/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthModule } from '../auth/auth.module.js';
import { sessionCookieName } from '../auth/cookies.js';
import { CsrfGuard, SessionGuard } from '../auth/guards.js';
import { ApiError, parseBody } from '../common/api-error.js';
import type { Env } from '../config/env.js';
import { ACCOUNT_DATA_REPOSITORY, DB_CONNECTION, ENV } from '../tokens.js';
import { DrizzleAccountDataRepository } from './drizzle-account-data.repository.js';
import type { AccountDataRepository } from './types.js';

/** Wort, das zur Bestätigung der Löschung eingetippt wird. */
export const DELETE_CONFIRMATION = 'LÖSCHEN';

@Injectable()
export class AccountService {
  constructor(@Inject(ACCOUNT_DATA_REPOSITORY) private readonly data: AccountDataRepository) {}

  export(accountId: string) {
    return this.data.export(accountId);
  }

  setLocale(accountId: string, locale: 'de' | 'en' | null) {
    return this.data.setLocale(accountId, locale);
  }

  async delete(accountId: string, confirmation: string, role: string): Promise<void> {
    if (confirmation !== DELETE_CONFIRMATION) {
      throw new ApiError(
        400,
        'confirmation_required',
        `Zur Bestätigung „${DELETE_CONFIRMATION}“ eingeben`,
      );
    }
    // Ein Superadmin muss die Rolle zuerst abgeben, damit die Instanz verwaltbar bleibt.
    if (role === 'superadmin')
      throw new ApiError(409, 'superadmin_delete', 'Superadmins können sich nicht löschen');
    await this.data.delete(accountId, 'Gelöschter Spieler');
  }
}

@Controller('account')
@UseGuards(SessionGuard, CsrfGuard)
export class AccountController {
  constructor(
    @Inject(AccountService) private readonly accounts: AccountService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Auskunft: alle gespeicherten Daten als JSON-Datei. */
  @Get('export')
  async export(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('content-disposition', 'attachment; filename="tbca-daten.json"');
    reply.header('cache-control', 'no-store');
    return this.accounts.export(req.auth!.accountId);
  }

  @Put('settings')
  @HttpCode(204)
  settings(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.accounts.setLocale(
      req.auth!.accountId,
      parseBody(accountSettingsSchema, body).locale,
    );
  }

  @Post('delete')
  @HttpCode(204)
  async delete(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    await this.accounts.delete(
      req.auth!.accountId,
      parseBody(accountDeleteSchema, body).confirmation,
      req.auth!.globalRole,
    );
    reply.clearCookie(sessionCookieName(this.env), { path: '/' });
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [
    AccountService,
    {
      provide: ACCOUNT_DATA_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (c: DbConnection) => new DrizzleAccountDataRepository(c.db),
    },
  ],
})
export class AccountModule {}
