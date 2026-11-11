import { createApiApp } from './app.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = await createApiApp(env);
await app.listen({ port: env.API_PORT, host: env.API_HOST });
