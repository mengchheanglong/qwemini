import { DEFAULT_DAEMON_PORT } from '@qwemini/protocol';
import { QweminiDaemon } from './server.js';

const port = Number(process.env.QWEMINI_PORT ?? DEFAULT_DAEMON_PORT);
const daemon = new QweminiDaemon(process.cwd(), port);

await daemon.start();

console.log(`Qwemini daemon listening on ${daemon.getBaseUrl()}`);

