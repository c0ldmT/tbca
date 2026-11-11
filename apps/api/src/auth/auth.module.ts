import { Module } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';

import type { Env } from '../config/env.js';
import { ACCOUNT_REPOSITORY, DB_CONNECTION, DISCORD_OAUTH, ENV, SESSION_STORE } from '../tokens.js';
import { AuthController } from './auth.controller.js';
import { DiscordOAuthClient } from './discord-oauth.js';
import { DrizzleAccountRepository, DrizzleSessionStore } from './drizzle-repositories.js';
import { CsrfGuard, SessionGuard } from './guards.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    SessionService,
    SessionGuard,
    CsrfGuard,
    {
      provide: ACCOUNT_REPOSITORY,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleAccountRepository(conn.db),
    },
    {
      provide: SESSION_STORE,
      inject: [DB_CONNECTION],
      useFactory: (conn: DbConnection) => new DrizzleSessionStore(conn.db),
    },
    {
      provide: DISCORD_OAUTH,
      inject: [ENV],
      useFactory: (env: Env) => new DiscordOAuthClient(env),
    },
  ],
  exports: [SessionService, SessionGuard, CsrfGuard],
})
export class AuthModule {}
