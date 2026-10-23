import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const name = process.argv[i];
  const value = process.argv[i + 1];
  if (!['--version', '--platform', '--out-dir'].includes(name) || !value) {
    throw new Error(
      'Usage: build-duckdb-driver.mjs [--version dev|vX.Y.Z] [--platform linux-amd64|windows-amd64|macos-universal] [--out-dir path]',
    );
  }
  flags.set(name, value);
}
const version = flags.get('--version') ?? 'dev';
if (version !== 'dev' && !/^v[0-9][0-9A-Za-z.-]*$/.test(version)) throw new Error('Invalid release version');
const defaultPlatform =
  process.platform === 'darwin' ? 'macos-universal' : process.platform === 'win32' ? 'windows-amd64' : 'linux-amd64';
const platform = flags.get('--platform') ?? defaultPlatform;
const target = { 'linux-amd64': 'linux', 'windows-amd64': 'windows', 'macos-universal': 'darwin' }[platform];
if (!target) throw new Error('Unsupported driver release platform');
const dir = flags.get('--out-dir') ?? join(root, 'build', 'duckdb-driver');
mkdirSync(dir, { recursive: true });
const name = `kamehadb-duckdb-driver-${platform}${target === 'windows' ? '.exe' : ''}`;
const output = join(dir, name);
const pkg = 'github.com/asta-nguyen/kamehadb/dbcore/duckdriver';

// Build the native helper before the desktop: its actual bytes, not a remote
// checksum file, establish the checksum embedded in the matching app.
function execute(program, args, env = process.env) {
  const result = spawnSync(program, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} failed (${result.status})`);
}
function build(arch, path) {
  execute(
    'go',
    [
      'build',
      '-trimpath',
      '-ldflags',
      `-s -w -X ${pkg}.ReleaseVersion=${version}`,
      '-o',
      path,
      './cmd/kamehadb-duckdb-driver',
    ],
    { ...process.env, GOOS: target, GOARCH: arch, CGO_ENABLED: '1' },
  );
}
if (target === 'darwin') {
  const amd64 = `${output}-amd64`;
  const arm64 = `${output}-arm64`;
  build('amd64', amd64);
  build('arm64', arm64);
  execute('lipo', ['-create', amd64, arm64, '-output', output]);
  // Lipo changes signed bytes; restore ad-hoc signing before calculating SHA.
  execute('codesign', ['--force', '--sign', '-', output]);
} else {
  build('amd64', output);
}
chmodSync(output, 0o755);
// Read protocol identity from the built executable, keeping the release
// manifest aligned with the Go source without another version constant.
const identity = spawnSync(output, [], {
  encoding: 'utf8',
  input: `${JSON.stringify({ id: 1, method: 'hello' })}\n${JSON.stringify({ id: 2, method: 'close' })}\n`,
});
if (identity.error || identity.status !== 0) throw identity.error ?? new Error('Driver handshake failed');
const handshake = JSON.parse(identity.stdout.trim().split('\n')[0]).result;
if (handshake.version !== version) throw new Error('Built driver release version mismatch');
const binary = readFileSync(output);
const sha256 = createHash('sha256').update(binary).digest('hex');
const asset = `${output}.gz`;
writeFileSync(asset, gzipSync(binary, { level: 9 }));
const appLdflags = version === 'dev' ? '' : `-X ${pkg}.ReleaseVersion=${version} -X ${pkg}.ReleaseSHA256=${sha256}`;
writeFileSync(
  join(dir, 'manifest.json'),
  `${JSON.stringify(
    {
      version,
      platform,
      name,
      sha256,
      protocol: handshake.protocol,
      bytes: binary.length,
      gzipBytes: readFileSync(asset).length,
      appLdflags,
    },
    null,
    2,
  )}\n`,
);
if (process.env.GITHUB_ENV && appLdflags) {
  appendFileSync(process.env.GITHUB_ENV, `DUCKDB_LDFLAGS=${appLdflags}\n`);
}
console.log(`DuckDB ${version}: ${asset}\nSHA-256: ${sha256}`);
if (version === 'dev') console.log(`Development only: set KAMEHADB_DUCKDB_DRIVER_PATH=${output}`);
