import { startBot } from './bot.js';

const client = await startBot();
if (client) process.on('SIGTERM', () => void client.destroy().then(() => process.exit(0)));
