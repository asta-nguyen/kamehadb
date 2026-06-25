import pino from 'pino';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { mkdirSync } from 'fs';

const sidecarDir = dirname(fileURLToPath(import.meta.url));
const defaultDataDir = resolve(sidecarDir, '..', '..');
const logsDir = join(process.env.KAMEHADB_DATA_DIR || defaultDataDir, 'logs');
mkdirSync(logsDir, { recursive: true });

export const log = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    redact: ['password', 'secret', 'token'],
  },
  pino.multistream([
    { stream: process.stdout },
    { stream: pino.destination({ dest: join(logsDir, 'sidecar.log'), mkdir: true, sync: false }) },
  ]),
);
