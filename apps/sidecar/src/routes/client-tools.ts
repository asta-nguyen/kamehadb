import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { access, constants as fsConstants } from 'fs/promises';
import { delimiter, join } from 'path';
import os from 'os';
import * as metadataStore from '../db/metadata-store.js';
import { handleError } from '../lib/route-utils.js';
import { log } from '../lib/logger.js';

const execFileAsync = promisify(execFile);

// Tools that can be configured with custom binary paths.
export const CONFIGURABLE_TOOLS = ['psql', 'pg_dump', 'pg_restore', 'mysql', 'mysqldump', 'mongosh'] as const;
export type ConfigurableTool = (typeof CONFIGURABLE_TOOLS)[number];

function isConfigurableTool(value: string): value is ConfigurableTool {
  return (CONFIGURABLE_TOOLS as readonly string[]).includes(value);
}

// ── OS detection ──────────────────────────────────────────────────────────

type Pm = 'pacman' | 'apt' | 'dnf' | 'brew' | 'choco' | 'unknown';

function detectPm(): Pm {
  const platform = os.platform();
  if (platform === 'darwin') return 'brew';
  if (platform === 'win32') return 'choco';
  // Linux: detect distro from /etc/os-release
  try {
    const content = readFileSync('/etc/os-release', 'utf-8');
    const id = /(^|\n)ID=(.+)/.exec(content)?.[2]?.replaceAll('"', '').trim() ?? '';
    if (['arch', 'manjaro', 'garuda', 'endeavouros'].includes(id)) return 'pacman';
    if (['ubuntu', 'debian', 'linuxmint', 'pop'].includes(id)) return 'apt';
    if (['fedora', 'rhel', 'centos', 'rocky', 'alma'].includes(id)) return 'dnf';
  } catch {
    // ignore
  }
  return 'unknown';
}

// ── Install commands per tool per package manager ─────────────────────────

const INSTALL_COMMANDS: Record<string, Partial<Record<Pm, string>>> = {
  psql: {
    pacman: 'sudo pacman -S postgresql',
    apt: 'sudo apt install postgresql-client',
    dnf: 'sudo dnf install postgresql',
    brew: 'brew install libpq',
    choco: 'choco install postgresql',
  },
  pg_dump: {
    pacman: 'sudo pacman -S postgresql',
    apt: 'sudo apt install postgresql-client',
    dnf: 'sudo dnf install postgresql',
    brew: 'brew install libpq',
    choco: 'choco install postgresql',
  },
  pg_restore: {
    pacman: 'sudo pacman -S postgresql',
    apt: 'sudo apt install postgresql-client',
    dnf: 'sudo dnf install postgresql',
    brew: 'brew install libpq',
    choco: 'choco install postgresql',
  },
  mysql: {
    pacman: 'sudo pacman -S mariadb-clients',
    apt: 'sudo apt install default-mysql-client',
    dnf: 'sudo dnf install mariadb',
    brew: 'brew install mysql-client',
    choco: 'choco install mysql-cli',
  },
  mysqldump: {
    pacman: 'sudo pacman -S mariadb-clients',
    apt: 'sudo apt install default-mysql-client',
    dnf: 'sudo dnf install mariadb',
    brew: 'brew install mysql-client',
    choco: 'choco install mysql-cli',
  },
  // mongosh — installed via npm or MongoDB's official installer
  mongosh: {
    pacman: 'sudo pacman -S mongodb-tools',
    apt: 'sudo apt install mongodb-mongosh',
    dnf: 'sudo dnf install mongodb-mongosh',
    brew: 'brew install mongosh',
    choco: 'choco install mongosh',
  },
};

const UNINSTALL_COMMANDS: Record<string, Partial<Record<Pm, string>>> = {
  psql: {
    pacman: 'sudo pacman -R postgresql',
    apt: 'sudo apt remove postgresql-client',
    dnf: 'sudo dnf remove postgresql',
    brew: 'brew uninstall libpq',
    choco: 'choco uninstall postgresql',
  },
  pg_dump: {
    pacman: 'sudo pacman -R postgresql',
    apt: 'sudo apt remove postgresql-client',
    dnf: 'sudo dnf remove postgresql',
    brew: 'brew uninstall libpq',
    choco: 'choco uninstall postgresql',
  },
  pg_restore: {
    pacman: 'sudo pacman -R postgresql',
    apt: 'sudo apt remove postgresql-client',
    dnf: 'sudo dnf remove postgresql',
    brew: 'brew uninstall libpq',
    choco: 'choco uninstall postgresql',
  },
  mysql: {
    pacman: 'sudo pacman -R mariadb-clients',
    apt: 'sudo apt remove default-mysql-client',
    dnf: 'sudo dnf remove mariadb',
    brew: 'brew uninstall mysql-client',
    choco: 'choco uninstall mysql-cli',
  },
  mysqldump: {
    pacman: 'sudo pacman -R mariadb-clients',
    apt: 'sudo apt remove default-mysql-client',
    dnf: 'sudo dnf remove mariadb',
    brew: 'brew uninstall mysql-client',
    choco: 'choco uninstall mysql-cli',
  },
  mongosh: {
    pacman: 'sudo pacman -R mongodb-tools',
    apt: 'sudo apt remove mongodb-mongosh',
    dnf: 'sudo dnf remove mongodb-mongosh',
    brew: 'brew uninstall mongosh',
    choco: 'choco uninstall mongosh',
  },
};

const detectedPm: Pm = detectPm();

function getInstallCommand(tool: string): string | null {
  return INSTALL_COMMANDS[tool]?.[detectedPm] ?? null;
}

function getUninstallCommand(tool: string): string | null {
  return UNINSTALL_COMMANDS[tool]?.[detectedPm] ?? null;
}

// ── Path helpers ──────────────────────────────────────────────────────────

/** Search PATH for a binary, returning the full path if found. */
async function findOnPath(program: string): Promise<string | null> {
  if (program.includes('/') || program.includes('\\')) {
    try {
      await access(program, fsConstants.X_OK);
      return program;
    } catch {
      return null;
    }
  }

  const pathValue = process.env.PATH;
  if (!pathValue) return null;

  for (const dir of pathValue.split(delimiter)) {
    const candidate = join(dir, program);
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // continue searching
    }
  }
  return null;
}

/** Try to get the version string of a tool to verify it works. */
async function tryGetVersion(program: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(program, ['--version'], { timeout: 5000 });
    return stdout.trim().split('\n')[0];
  } catch {
    return null;
  }
}

// ── Routes ────────────────────────────────────────────────────────────────

export const clientToolsRouter = new Hono();

// GET /client-tools/paths
clientToolsRouter.get('/paths', async (c) => {
  try {
    const configured = metadataStore.getClientToolPaths();
    const result: Record<
      string,
      {
        configured: string | null;
        detected: string | null;
        version: string | null;
        installCommand: string | null;
        uninstallCommand: string | null;
      }
    > = {};

    for (const tool of CONFIGURABLE_TOOLS) {
      const configuredPath = configured[tool] ?? null;
      const detectFrom = configuredPath ?? tool;
      const detected = await findOnPath(detectFrom);
      const version = detected ? await tryGetVersion(detected) : null;
      result[tool] = {
        configured: configuredPath,
        detected,
        version,
        installCommand: getInstallCommand(tool),
        uninstallCommand: getUninstallCommand(tool),
      };
    }

    return c.json(result);
  } catch (err) {
    return handleError(c, err, 'clientToolsGetPaths');
  }
});

// POST /client-tools/paths
clientToolsRouter.post(
  '/paths',
  zValidator(
    'json',
    z.record(z.string(), z.string()).refine((entries) => Object.keys(entries).every(isConfigurableTool), {
      message: 'Unknown tool name in request',
    }),
  ),
  async (c) => {
    try {
      const input = c.req.valid('json') as Record<string, string>;
      metadataStore.saveClientToolPaths(input);
      log.info({ tools: Object.keys(input) }, 'Client tool paths updated');
      return c.json({ success: true });
    } catch (err) {
      return handleError(c, err, 'clientToolsSavePaths');
    }
  },
);

// POST /client-tools/resolve/:tool
clientToolsRouter.post('/resolve/:tool', async (c) => {
  try {
    const tool = c.req.param('tool');
    if (!isConfigurableTool(tool)) {
      return c.json({ error: 'Unknown tool' }, 400);
    }

    const configured = metadataStore.getClientToolPath(tool);
    const detectFrom = configured ?? tool;
    const detected = await findOnPath(detectFrom);
    const version = detected ? await tryGetVersion(detected) : null;

    return c.json({
      tool,
      configured,
      detected,
      version,
      found: detected !== null,
    });
  } catch (err) {
    return handleError(c, err, 'clientToolsResolve');
  }
});
