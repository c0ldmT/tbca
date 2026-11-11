import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb, pingDb, type DbConnection } from '@tbca/db';

import type { Env } from '../config/env.js';
import { DB_CONNECTION, DB_PING, ENV } from '../tokens.js';

export type DbPing = () => Promise<void>;

@Global()
@Module({
  providers: [
    {
      provide: DB_CONNECTION,
      inject: [ENV],
      useFactory: (env: Env): DbConnection =>
        createDb(env.DATABASE_URL, {
          maxConnections: env.DB_MAX_CONNECTIONS,
          applicationName: 'tbca-api',
        }),
    },
    {
      provide: DB_PING,
      inject: [DB_CONNECTION],
      useFactory:
        (conn: DbConnection): DbPing =>
        () =>
          pingDb(conn.pool),
    },
  ],
  exports: [DB_CONNECTION, DB_PING],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB_CONNECTION) private readonly conn: DbConnection) {}

  async onApplicationShutdown(): Promise<void> {
    await this.conn.close();
  }
}
