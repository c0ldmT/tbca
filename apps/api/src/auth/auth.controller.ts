import { randomBytes, timingSafeEqual } from 'node:crypto';

import {
  Body,
  Controller,
  ForbiddenException,
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

import { parseBody } from '../common/api-error.js';
import { discordRedirectFor, isDiscordConfigured, originOf, type Env } from '../config/env.js';
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

const devLoginBody = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[\p{L}\p{N} _.-]+$/u),
});

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(DISCORD_OAUTH) private readonly discord: DiscordOAuth,
  ) {}

  /** Welche Anmeldewege diese Instanz anbietet. */
  @Get('options')
  options(): { discord: boolean; devLogin: boolean } {
    return { discord: isDiscordConfigured(this.env), devLogin: this.env.DEV_LOGIN };
  }

  /**
   * Startet den Discord-Login: zufälliges `state` und die Adresse, über die der Browser kam,
   * ins signierte Cookie, dann zu Discord. Der Rücksprung geht an dieselbe Adresse – so
   * funktioniert der Login auch über die LAN-Adresse des Dev-Servers.
   */
  @Get('discord')
  startDiscord(@Req() request: FastifyRequest, @Res() reply: FastifyReply): void {
    this.requireDiscord();
    const state = randomBytes(24).toString('base64url');
    const origin = originOf(this.env, request);
    reply
      .setCookie(oauthStateCookieName(this.env), `${state}|${origin}`, {
        path: '/',
        httpOnly: true,
        secure: this.env.COOKIE_SECURE,
        sameSite: 'lax',
        signed: true,
        maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
      })
      .header('cache-control', 'no-store')
      .redirect(this.discord.authorizeUrl(state, discordRedirectFor(this.env, origin)), 302);
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
    const [expectedState, savedOrigin] = (this.readSignedCookie(request, stateCookie) ?? '').split(
      '|',
    );
    reply.clearCookie(stateCookie, { path: '/' });
    const origin =
      savedOrigin && this.env.WEB_ORIGINS.includes(savedOrigin) ? savedOrigin : this.env.WEB_ORIGIN;

    const parsed = callbackQuery.safeParse(query);
    if (!parsed.success) return this.finish(reply, 'failed', origin);
    if ('error' in parsed.data) return this.finish(reply, 'cancelled', origin);
    if (!expectedState || !safeEqual(parsed.data.state, expectedState)) {
      this.logger.warn('Discord-Login: State stimmt nicht überein');
      return this.finish(reply, 'failed', origin);
    }

    try {
      const profile = await this.discord.fetchProfile(
        parsed.data.code,
        discordRedirectFor(this.env, origin),
      );
      const accountId = await this.accounts.loginWithIdentity(profile, new Date());
      const session = await this.sessions.create(accountId);
      reply.setCookie(
        sessionCookieName(this.env),
        session.token,
        sessionCookieOptions(this.env, session.maxAgeSeconds),
      );
      return this.finish(reply, 'success', origin);
    } catch (error) {
      this.logger.error(
        `Discord-Login fehlgeschlagen: ${error instanceof Error ? error.message : 'unbekannt'}`,
      );
      return this.finish(reply, 'failed', origin);
    }
  }

  /**
   * Anmeldung ohne Discord für lokale Tests (DEV_LOGIN=true, nie in Produktion): gleicher Name,
   * gleicher Account. Nur von erlaubten Adressen der Website aus.
   */
  @Post('dev-login')
  @HttpCode(204)
  async devLogin(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    if (!this.env.DEV_LOGIN) throw new NotFoundException('Nicht verfügbar');
    const origin = request.headers.origin;
    if (!origin || !this.env.WEB_ORIGINS.includes(origin)) {
      throw new ForbiddenException('Ungültiger Origin');
    }
    const { name } = parseBody(devLoginBody, body);
    const accountId = await this.accounts.loginWithIdentity(
      {
        provider: 'dev',
        providerUserId: name.toLowerCase(),
        displayName: name,
        avatarUrl: null,
      },
      new Date(),
    );
    const session = await this.sessions.create(accountId);
    reply.setCookie(
      sessionCookieName(this.env),
      session.token,
      sessionCookieOptions(this.env, session.maxAgeSeconds),
    );
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
  private finish(reply: FastifyReply, result: LoginResult, origin: string): void {
    reply.header('cache-control', 'no-store').redirect(`${origin}/?login=${result}`, 302);
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
