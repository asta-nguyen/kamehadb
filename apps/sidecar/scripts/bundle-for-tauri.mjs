import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from 'fs';
import { execFileSync } from 'child_process';
import { basename, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '../../..');
const sidecarDir = resolve(__dirname, '..');
const outDir = resolve(workspaceRoot, 'apps/desktop/src-tauri/resources/sidecar');
const bundledNodePath = resolve(outDir, 'node/bin', basename(process.execPath));

function findPnpmPackageDir(packagePrefix) {
  const pnpmDir = resolve(outDir, 'node_modules/.pnpm');
  const entry = readdirSync(pnpmDir).find((name) => name.startsWith(packagePrefix));
  if (!entry) {
    throw new Error(`Could not find ${packagePrefix} in ${pnpmDir}`);
  }
  return resolve(pnpmDir, entry, 'node_modules', packagePrefix.replace(/@$/, ''));
}

function materializeNodeModuleSymlink(path) {
  if (!lstatSync(path).isSymbolicLink()) return;
  const realPath = realpathSync(path);
  rmSync(path, { force: true, recursive: true });
  cpSync(realPath, path, { recursive: true, dereference: true });
}

function materializeTopLevelNodeModules() {
  const nodeModulesDir = resolve(outDir, 'node_modules');
  for (const entry of readdirSync(nodeModulesDir)) {
    if (entry === '.bin' || entry === '.pnpm' || entry === '.modules.yaml') continue;
    const entryPath = resolve(nodeModulesDir, entry);
    if (entry.startsWith('@') && !lstatSync(entryPath).isSymbolicLink()) {
      for (const scopedEntry of readdirSync(entryPath)) {
        materializeNodeModuleSymlink(resolve(entryPath, scopedEntry));
      }
      continue;
    }
    materializeNodeModuleSymlink(entryPath);
  }
}

function materializePnpmStorePackages() {
  const nodeModulesDir = resolve(outDir, 'node_modules');
  const pnpmDir = resolve(nodeModulesDir, '.pnpm');
  for (const storeEntry of readdirSync(pnpmDir)) {
    const packageRoot = resolve(pnpmDir, storeEntry, 'node_modules');
    if (!existsSync(packageRoot)) continue;
    for (const entry of readdirSync(packageRoot)) {
      const entryPath = resolve(packageRoot, entry);
      if (entry.startsWith('@')) {
        const targetScope = resolve(nodeModulesDir, entry);
        mkdirSync(targetScope, { recursive: true });
        for (const scopedEntry of readdirSync(entryPath)) {
          const target = resolve(targetScope, scopedEntry);
          if (!existsSync(target)) {
            cpSync(resolve(entryPath, scopedEntry), target, { recursive: true, dereference: true });
          }
        }
        continue;
      }
      const target = resolve(nodeModulesDir, entry);
      if (!existsSync(target)) {
        cpSync(entryPath, target, { recursive: true, dereference: true });
      }
    }
  }
}

console.log('[bundle-sidecar] Bundling sidecar for Tauri...');

// pnpm deploy already writes a standalone tree, so deploy directly into the
// Tauri resources directory and skip the second full copy of node_modules.
if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}

// Verify sidecar dist/ exists (compiled JS)
const distSrc = resolve(sidecarDir, 'dist');
if (!existsSync(distSrc)) {
  console.error('[bundle-sidecar] ERROR: sidecar dist/ not found. Run "pnpm --filter @kamehadb/sidecar build" first.');
  process.exit(1);
}

// Use pnpm deploy to create a self-contained directory with all production deps resolved
// (no symlinks, all transitive deps flattened into node_modules)
console.log('[bundle-sidecar] Running pnpm deploy --prod...');
mkdirSync(resolve(outDir, '..'), { recursive: true });
try {
  execFileSync('pnpm', [
    'deploy',
    '--filter', '@kamehadb/sidecar',
    '--prod',
    outDir,
  ], {
    cwd: workspaceRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
} catch (err) {
  console.error('[bundle-sidecar] pnpm deploy failed:', err.stderr || err.message);
  process.exit(1);
}
rmSync(resolve(outDir, '.deploy-dist'), { recursive: true, force: true });

// Copy compiled dist/ into the deployed directory (pnpm deploy copies src/ but we need dist/)
console.log('[bundle-sidecar] Copying dist/ into deployed directory...');
cpSync(distSrc, resolve(outDir, 'dist'), { recursive: true });

// Bundle the Node.js runtime used for this script so packaged apps do not
// depend on a user-installed Node, and native addons keep the same ABI.
console.log('[bundle-sidecar] Copying Node.js runtime...');
mkdirSync(resolve(bundledNodePath, '..'), { recursive: true });
cpSync(process.execPath, bundledNodePath);
chmodSync(bundledNodePath, 0o755);

// Pin the bundled native addon ABI to the Node.js executable that built the
// resource tree. Tauri reads this marker and chooses a matching local Node.
writeFileSync(resolve(outDir, 'node-abi.txt'), `${process.versions.modules}\n`);

console.log('[bundle-sidecar] Installing better-sqlite3 native binding for current Node.js...');
try {
  const prebuildInstall = resolve(findPnpmPackageDir('prebuild-install@'), 'bin.js');
  execFileSync(process.execPath, [prebuildInstall], {
    cwd: findPnpmPackageDir('better-sqlite3@'),
    stdio: 'pipe',
    encoding: 'utf-8',
  });
} catch (err) {
  console.warn('[bundle-sidecar] better-sqlite3 prebuild-install skipped:', err.stderr?.toString() || err.message);
  console.warn('[bundle-sidecar] The native binding from pnpm install will be used instead.');
}

console.log('[bundle-sidecar] Materializing top-level node_modules symlinks...');
materializeTopLevelNodeModules();
materializePnpmStorePackages();
rmSync(resolve(outDir, 'node_modules/.pnpm'), { recursive: true, force: true });
rmSync(resolve(outDir, 'node_modules/.modules.yaml'), { force: true });

// Write a minimal package.json for ESM resolution
const pkg = JSON.parse(readFileSync(resolve(sidecarDir, 'package.json'), 'utf-8'));
const runtimePkg = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  dependencies: pkg.dependencies,
};
writeFileSync(resolve(outDir, 'package.json'), JSON.stringify(runtimePkg, null, 2));

console.log('[bundle-sidecar] Done. Output:', outDir);
