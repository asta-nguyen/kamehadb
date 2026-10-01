import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ColumnInfo, DatabaseInfo, SchemaInfo, TableInfo } from '@kamehadb/shared';
import { MCP_QUERY_TIMEOUT_MS } from '../../lib/constants.js';
import { log } from '../../lib/logger.js';
import { QueryTimeoutError, type BoundedQueryInput, type BoundedQueryResult, type McpSqlAdapter } from '../types.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
// Both dev (src/mcp/adapters) and build (dist/mcp/adapters) resolve to apps/sidecar.
const sidecarRoot = join(currentDir, '..', '..', '..');

type WorkerResponse = { id: number; ok: boolean; result?: unknown; error?: string };
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

// Resolve the worker entry once: the compiled .js after build, otherwise the .ts
// source run through the tsx loader. A .ts worker must never be spawned raw.
function resolveWorkerArgs(): { args: string[]; cwd: string } {
  const compiled = join(currentDir, 'sqlite-worker.js');
  if (existsSync(compiled)) {
    return { args: [compiled], cwd: sidecarRoot };
  }
  const source = join(currentDir, 'sqlite-worker.ts');
  return { args: ['--import', 'tsx', source], cwd: sidecarRoot };
}

// One read-only SQLite worker per MCP adapter. Requests are line-delimited JSON;
// a per-request deadline kills the process so synchronous SQLite work cannot
// stall the sidecar event loop.
class SqliteMcpConnection {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private buffer = '';

  constructor(private readonly filePath: string) {}

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) return this.child;

    const { args, cwd } = resolveWorkerArgs();
    const child = spawn(process.execPath, [...args, this.filePath], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.onData(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      const message = chunk.trim();
      if (message) log.debug({ message }, 'sqlite-worker stderr');
    });
    child.on('exit', () => this.onExit());
    this.child = child;
    return child;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      newlineIndex = this.buffer.indexOf('\n');
      if (!line.trim()) continue;

      let response: WorkerResponse;
      try {
        response = JSON.parse(line) as WorkerResponse;
      } catch {
        continue;
      }

      const pending = this.pending.get(response.id);
      if (!pending) continue;
      this.pending.delete(response.id);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(response.error ?? 'SQLite MCP query failed'));
    }
  }

  private onExit(): void {
    this.child = null;
    for (const pending of this.pending.values()) {
      pending.reject(new Error('SQLite MCP worker exited before responding'));
    }
    this.pending.clear();
    this.buffer = '';
  }

  private request<T>(payload: Record<string, unknown>, timeoutMs: number): Promise<T> {
    const child = this.ensureChild();
    const id = this.nextId++;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.kill();
        reject(new QueryTimeoutError('SQLite MCP query exceeded the time budget'));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`);
    });
  }

  private kill(): void {
    if (this.child) {
      // SIGKILL is required: better-sqlite3 runs synchronously and cannot process
      // a graceful signal while blocked inside a query.
      this.child.kill('SIGKILL');
      this.child = null;
    }
  }

  requestWithBudget<T>(payload: Record<string, unknown>, timeoutMs: number): Promise<T> {
    return this.request<T>(payload, timeoutMs);
  }

  close(): void {
    this.kill();
  }
}

export function createSqliteMcpAdapter(filePath: string, timeoutMs = MCP_QUERY_TIMEOUT_MS): McpSqlAdapter {
  const connection = new SqliteMcpConnection(filePath);

  return {
    async listDatabases(): Promise<DatabaseInfo[]> {
      return connection.requestWithBudget<DatabaseInfo[]>({ type: 'listDatabases' }, timeoutMs);
    },
    async listSchemas(): Promise<SchemaInfo[]> {
      return connection.requestWithBudget<SchemaInfo[]>({ type: 'listSchemas' }, timeoutMs);
    },
    async listTables(): Promise<TableInfo[]> {
      return connection.requestWithBudget<TableInfo[]>({ type: 'listTables' }, timeoutMs);
    },
    async getTableColumns(tableId: string): Promise<ColumnInfo[]> {
      return connection.requestWithBudget<ColumnInfo[]>({ type: 'getTableColumns', tableId }, timeoutMs);
    },
    async runQueryBounded(input: BoundedQueryInput): Promise<BoundedQueryResult> {
      const start = performance.now();
      const result = await connection.requestWithBudget<{
        columns: BoundedQueryResult['columns'];
        rows: BoundedQueryResult['rows'];
        truncated: boolean;
      }>({ type: 'query', query: input.query, maxRows: input.maxRows }, timeoutMs);
      return { ...result, durationMs: Math.round(performance.now() - start) };
    },
    async close(): Promise<void> {
      connection.close();
    },
  };
}
