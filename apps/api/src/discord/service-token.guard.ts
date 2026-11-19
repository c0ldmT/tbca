import { timingSafeEqual } from 'node:crypto';

import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import type { Env } from '../config/env.js';
import { ENV } from '../tokens.js';

/** Interne API für Bots: Authorization: Bearer <BOT_SERVICE_TOKEN>. */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.env.BOT_SERVICE_TOKEN;
    if (!expected) throw new ServiceUnavailableException('Interne API ist nicht konfiguriert');
    const header = context.switchToHttp().getRequest<FastifyRequest>().headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new UnauthorizedException('Ungültiges Service-Token');
    return true;
  }
}
