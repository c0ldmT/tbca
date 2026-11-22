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
export const SEASON_REPOSITORY = Symbol('SEASON_REPOSITORY');
export const CHARACTER_REPOSITORY = Symbol('CHARACTER_REPOSITORY');
export const FIGHT_REPOSITORY = Symbol('FIGHT_REPOSITORY');
export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');
export const ECONOMY_REPOSITORY = Symbol('ECONOMY_REPOSITORY');
export const DUNGEON_REPOSITORY = Symbol('DUNGEON_REPOSITORY');
export const RATE_LIMITER = Symbol('RATE_LIMITER');
export const DISCORD_REPOSITORY = Symbol('DISCORD_REPOSITORY');
export const TEAM_REPOSITORY = Symbol('TEAM_REPOSITORY');
export const ADMIN_REPOSITORY = Symbol('ADMIN_REPOSITORY');
