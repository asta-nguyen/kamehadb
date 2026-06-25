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
    redact: {
      // Persisted logs should never keep credentials, even when callers attach
      // nested config objects or provider payloads to structured log metadata.
      paths: [
        'password',
        'secret',
        'token',
        'apiKey',
        'authorization',
        'cookie',
        'set-cookie',
        '*.set-cookie',
        '*.*.set-cookie',
        'connectionString',
        '*.password',
        '*.secret',
        '*.token',
        '*.apiKey',
        '*.authorization',
        '*.cookie',
        '*.connectionString',
        '*.*.password',
        '*.*.secret',
        '*.*.token',
        '*.*.apiKey',
        '*.*.authorization',
        '*.*.cookie',
        '*.*.connectionString',
      ],
      censor: '[REDACTED]',
    },
  },
  pino.multistream([
    { stream: process.stdout },
    { stream: pino.destination({ dest: join(logsDir, 'sidecar.log'), mkdir: true, sync: false }) },
  ]),
);
