import { accessSync, constants as fsConstants, readdirSync } from 'fs';
import { access, mkdir } from 'fs/promises';
import { delimiter, dirname, join, resolve } from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import os from 'os';

const execFileAsync = promisify(execFile);
const MONGOSH_INSTALL_DIR = 'tools/mongosh';

export interface MongoshCommand {
  readonly program: string;
  readonly argsPrefix: string[];
}

let mongoshInstallPromise: Promise<MongoshCommand> | null = null;

export async function resolveMongoshCommand(): Promise<MongoshCommand> {
  const localCommand = findMongoshOnPath();
  if (localCommand) {
    console.debug('[mongosh] resolved from PATH:', localCommand);
    return localCommand;
  }
  console.debug('[mongosh] not found on PATH, trying bundled...');

  const installedCommand = await findBundledMongosh();
  if (installedCommand) {
    console.debug('[mongosh] resolved from bundled install:', installedCommand);
    return installedCommand;
  }
  console.debug('[mongosh] no bundled install found, attempting auto-install...');

  const installed = await installBundledMongosh();
  console.debug('[mongosh] auto-install resolved to:', installed);
  return installed;
}
function findMongoshOnPath(): MongoshCommand | null {
  const pathValue = process.env.PATH;
  if (!pathValue) return null;

  for (const dir of pathValue.split(delimiter)) {
    const candidate = join(dir, 'mongosh');
    if (exists(candidate)) return { program: candidate, argsPrefix: [] };
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

async function findBundledMongosh(): Promise<MongoshCommand | null> {
  const baseDir = getBundledInstallDir();
  const directCandidates = [
    join(baseDir, 'node_modules/.bin/mongosh'),
    join(baseDir, 'node_modules/.bin/mongosh.cmd'),
    join(baseDir, 'node_modules/mongosh/bin/mongosh'),
  ];

  for (const candidate of directCandidates) {
    if (await existsAsync(candidate)) {
      return { program: candidate, argsPrefix: [] };
    }
  }

  const jsCandidate = join(baseDir, 'node_modules/mongosh/bin/mongosh.js');
  if (await existsAsync(jsCandidate)) {
    return { program: process.execPath, argsPrefix: [jsCandidate] };
  }

  return null;
}

async function installBundledMongosh(): Promise<MongoshCommand> {
  if (!mongoshInstallPromise) {
    mongoshInstallPromise = (async () => {
      const baseDir = getBundledInstallDir();
      await mkdir(baseDir, { recursive: true });
      const npmCommand = resolveNpmCommand();
      await execFileAsync(
        npmCommand.program,
        [...npmCommand.argsPrefix, 'install', 'mongosh', '--prefix', baseDir, '--no-package-lock', '--silent'],
        {
          env: {
            ...process.env,
            npm_config_cache: join(baseDir, '.npm-cache'),
          },
        },
      );

      const installedCommand = await findBundledMongosh();
      if (!installedCommand) {
        throw new Error('mongosh installed, but the binary could not be located');
      }
      return installedCommand;
    })().finally(() => {
      mongoshInstallPromise = null;
    });
  }

  try {
    return await mongoshInstallPromise;
  } catch (error) {
    throw new Error(
      `mongosh is not installed and automatic install failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function getBundledInstallDir(): string {
  return resolve(process.env.KAMEHADB_DATA_DIR || os.tmpdir(), MONGOSH_INSTALL_DIR);
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

function resolveNpmCommand(): { program: string; argsPrefix: string[] } {
  const npmOnPath = findExecutable('npm');
  if (npmOnPath) {
    return { program: npmOnPath, argsPrefix: [] };
  }

  const npmCli = findNpmCliScript();
  if (npmCli) {
    return { program: process.execPath, argsPrefix: [npmCli] };
  }

  throw new Error('npm was not found. Install Node.js/npm or install mongosh manually.');
}

function findExecutable(name: string): string | null {
  const pathValue = process.env.PATH;
  if (pathValue) {
    for (const dir of pathValue.split(delimiter)) {
      const candidate = join(dir, name);
      if (exists(candidate)) return candidate;
    }
  }

  const candidates = [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`];

  return candidates.find((candidate) => exists(candidate)) ?? null;
}

function findNpmCliScript(): string | null {
  const candidates = [
    resolve(dirname(process.execPath), '..', 'lib/node_modules/npm/bin/npm-cli.js'),
    '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js',
    '/usr/local/lib/node_modules/npm/bin/npm-cli.js',
  ];

  return candidates.find((candidate) => exists(candidate)) ?? null;
}

function exists(candidate: string): boolean {
  try {
    accessSync(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function existsAsync(candidate: string): Promise<boolean> {
  try {
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
