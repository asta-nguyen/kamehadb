import { accessSync, constants as fsConstants, readdirSync } from 'fs';
import { delimiter, join, resolve } from 'path';
import os from 'os';
import { log } from './logger.js';

const isWindows = os.platform() === 'win32';
const exeSuffixes = isWindows ? ['', '.exe', '.cmd'] : [''];

export interface MongoshCommand {
  readonly program: string;
  readonly argsPrefix: string[];
}

export async function resolveMongoshCommand(): Promise<MongoshCommand> {
  // 1. Search PATH.
  const localCommand = findMongoshOnPath();
  if (localCommand) {
    log.debug({ command: localCommand }, 'mongosh resolved from PATH');
    return localCommand;
  }

  throw new Error(
    'mongosh is not installed. Install it from https://www.mongodb.com/docs/mongodb-shell/install/ and try again.',
  );
}

function findMongoshOnPath(): MongoshCommand | null {
  const pathValue = process.env.PATH;
  if (pathValue) {
    for (const dir of pathValue.split(delimiter)) {
      for (const suffix of exeSuffixes) {
        const candidate = join(dir, `mongosh${suffix}`);
        if (exists(candidate)) return { program: candidate, argsPrefix: [] };
      }
    }
  }

  const candidates = [
    '/opt/homebrew/bin/mongosh',
    '/usr/local/bin/mongosh',
    ...versionedMongoBinCandidates('/opt/homebrew/opt'),
    ...versionedMongoBinCandidates('/usr/local/opt'),
  ];

  const candidate = candidates.find((value) => exists(value));
  return candidate ? { program: candidate, argsPrefix: [] } : null;
}

function versionedMongoBinCandidates(root: string): string[] {
  try {
    return readdirSync(root)
      .filter((entry) => entry.startsWith('mongodb') || entry.startsWith('mongosh'))
      .map((entry) => join(root, entry, 'bin', 'mongosh'))
      .reverse();
  } catch {
    return [];
  }
}

function exists(candidate: string): boolean {
  try {
    accessSync(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
