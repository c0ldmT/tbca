import { randomBytes, timingSafeEqual } from 'node:crypto';

import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { MeResponse } from '@tbca/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { isDiscordConfigured, type Env } from '../config/env.js';
import { ACCOUNT_REPOSITORY, DISCORD_OAUTH, ENV } from '../tokens.js';
import {
  OAUTH_STATE_MAX_AGE_SECONDS,
  oauthStateCookieName,
  sessionCookieName,
  sessionCookieOptions,
} from './cookies.js';
import { CsrfGuard, SessionGuard } from './guards.js';
import { SessionService } from './session.service.js';
import type { AccountRepository, DiscordOAuth } from './types.js';

const callbackQuery = z.union([
  z.object({ code: z.string().min(1).max(512), state: z.string().min(1).max(128) }),
  z.object({ error: z.string().max(128) }),
]);

type LoginResult = 'success' | 'cancelled' | 'failed';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(DISCORD_OAUTH) private readonly discord: DiscordOAuth,
  ) {}

  /** Startet den Discord-Login: zufälliges `state` ins signierte Cookie, dann zu Discord. */
  @Get('discord')
  startDiscord(@Res() reply: FastifyReply): void {
    this.requireDiscord();
    const state = randomBytes(24).toString('base64url');
    reply
      .setCookie(oauthStateCookieName(this.env), state, {
        path: '/',
        httpOnly: true,
        secure: this.env.COOKIE_SECURE,
        sameSite: 'lax',
        signed: true,
        maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
      })
      .header('cache-control', 'no-store')
      .redirect(this.discord.authorizeUrl(state), 302);
  }

  /** Rückkehr von Discord: State prüfen, Account anmelden, Session-Cookie setzen. */
  @Get('discord/callback')
  async discordCallback(
    @Query() query: unknown,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    this.requireDiscord();
    const stateCookie = oauthStateCookieName(this.env);
    const expectedState = this.readSignedCookie(request, stateCookie);
    reply.clearCookie(stateCookie, { path: '/' });

    const parsed = callbackQuery.safeParse(query);
    if (!parsed.success) return this.finish(reply, 'failed');
    if ('error' in parsed.data) return this.finish(reply, 'cancelled');
    if (!expectedState || !safeEqual(parsed.data.state, expectedState)) {
      this.logger.warn('Discord-Login: State stimmt nicht überein');
      return this.finish(reply, 'failed');
    }

    try {
      const profile = await this.discord.fetchProfile(parsed.data.code);
      const accountId = await this.accounts.loginWithIdentity(profile, new Date());
      const session = await this.sessions.create(accountId);
      reply.setCookie(
        sessionCookieName(this.env),
        session.token,
        sessionCookieOptions(this.env, session.maxAgeSeconds),
      );
      return this.finish(reply, 'success');
    } catch (error) {
      this.logger.error(
        `Discord-Login fehlgeschlagen: ${error instanceof Error ? error.message : 'unbekannt'}`,
      );
      return this.finish(reply, 'failed');
    }
  }

  /** Aktueller Account mit Identitäten und CSRF-Token. */
  @Get('me')
  @UseGuards(SessionGuard)
  async me(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MeResponse> {
    const auth = request.auth!;
    const profile = await this.accounts.findProfile(auth.accountId);
    if (!profile) throw new NotFoundException('Account nicht gefunden');
    reply.header('cache-control', 'no-store');
    return { ...profile, csrfToken: auth.csrfToken };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard, CsrfGuard)
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.sessions.revoke(request.auth!.token);
    reply.clearCookie(sessionCookieName(this.env), { path: '/' });
  }

  private requireDiscord(): void {
    if (!isDiscordConfigured(this.env)) {
      throw new ServiceUnavailableException('Discord-Login ist nicht konfiguriert');
    }
  }

  private readSignedCookie(request: FastifyRequest, name: string): string | null {
    const raw = request.cookies[name];
    if (!raw) return null;
    const result = request.unsignCookie(raw);
    return result.valid ? result.value : null;
  }

  /** Zurück zur Website; `?login=` zeigt dort das Ergebnis an. */
  private finish(reply: FastifyReply, result: LoginResult): void {
    reply
      .header('cache-control', 'no-store')
      .redirect(`${this.env.WEB_ORIGIN}/?login=${result}`, 302);
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
