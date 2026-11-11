import type { FastifyInstance } from 'fastify';

/**
 * Sicherheits-Header für alle API-Antworten (Spezifikation, Abschnitt 17).
 * Die API liefert nur JSON und Weiterleitungen; daher die strengste CSP.
 * Die Header der Website setzt in Produktion Caddy.
 */
export function registerSecurityHeaders(app: FastifyInstance, options: { hsts: boolean }): void {
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('cross-origin-resource-policy', 'same-origin');
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    if (options.hsts) {
      reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    }
    return payload;
  });
}
