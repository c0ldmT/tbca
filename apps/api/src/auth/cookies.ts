import type { CookieSerializeOptions } from '@fastify/cookie';

import type { Env } from '../config/env.js';

/**
 * Cookie-Namen. Mit Secure-Flag (Produktion) tragen sie das Präfix __Host-: Der Browser
 * akzeptiert sie dann nur über HTTPS, ohne Domain-Attribut und mit Pfad /.
 */
export function sessionCookieName(env: Env): string {
  return env.COOKIE_SECURE ? '__Host-tbca_session' : 'tbca_session';
}

export function oauthStateCookieName(env: Env): string {
  return env.COOKIE_SECURE ? '__Host-tbca_oauth_state' : 'tbca_oauth_state';
}

export function sessionCookieOptions(env: Env, maxAgeSeconds: number): CookieSerializeOptions {
  return {
    path: '/',
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: maxAgeSeconds,
  };
}

export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
