/** Angemeldeter Benutzer einer Anfrage, gesetzt vom SessionGuard. */
export interface AuthContext {
  accountId: string;
  sessionId: string;
  csrfToken: string;
  /** Das Cookie-Token, um die Session beim Logout zu widerrufen. */
  token: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
