import { startWorker } from './worker.js';

const worker = await startWorker();
if (worker) process.once('SIGTERM', () => void worker.close().then(() => process.exit(0)));
