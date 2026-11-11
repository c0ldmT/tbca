import { timingSafeEqual } from 'node:crypto';

import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { CSRF_HEADER } from '@tbca/shared';
import type { FastifyRequest } from 'fastify';

import type { Env } from '../config/env.js';
import { ENV } from '../tokens.js';
import { sessionCookieName } from './cookies.js';
import { SessionService } from './session.service.js';

/** Lässt nur Anfragen mit gültiger Session durch und setzt `request.auth`. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = request.cookies[sessionCookieName(this.env)];
    const session = await this.sessions.resolve(token);
    if (!session || !token) throw new UnauthorizedException('Nicht angemeldet');
    request.auth = {
      accountId: session.accountId,
      sessionId: session.id,
      csrfToken: session.csrfToken,
      token,
    };
    return true;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF-Schutz für schreibende Anfragen: Das Token aus /auth/me muss im Header stehen,
 * und ein mitgeschickter Origin muss die eigene Website sein. Nach dem SessionGuard verwenden.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (origin !== undefined && origin !== this.env.WEB_ORIGIN) {
      throw new ForbiddenException('Ungültiger Origin');
    }
    const header = request.headers[CSRF_HEADER];
    const expected = request.auth?.csrfToken;
    if (typeof header !== 'string' || !expected || !safeEqual(header, expected)) {
      throw new ForbiddenException('CSRF-Token fehlt oder ist ungültig');
    }
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
