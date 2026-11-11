import { Global, Module, type DynamicModule } from '@nestjs/common';

import { ENV } from '../tokens.js';
import type { Env } from './env.js';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return { module: ConfigModule, providers: [{ provide: ENV, useValue: env }], exports: [ENV] };
  }
}
