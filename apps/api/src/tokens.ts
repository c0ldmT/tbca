/**
 * Injection-Tokens. Alle Abhängigkeiten werden über explizite Tokens injiziert,
 * damit die API ohne emitDecoratorMetadata funktioniert (tsx, Vitest, esbuild).
 */
export const ENV = Symbol('ENV');
export const CLOCK = Symbol('CLOCK');
export const DB_CONNECTION = Symbol('DB_CONNECTION');
export const DB_PING = Symbol('DB_PING');
export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');
export const SESSION_STORE = Symbol('SESSION_STORE');
export const DISCORD_OAUTH = Symbol('DISCORD_OAUTH');
