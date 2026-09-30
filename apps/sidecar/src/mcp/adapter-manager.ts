import { isMcpSupportedKind, KIND, type ConnectionProfile } from '@kamehadb/shared';
import { getProfile, getProfilePassword } from '../db/metadata-store.js';
import { MCP_MAX_CONCURRENT_CALLS_PER_PROFILE } from '../lib/constants.js';
import { log } from '../lib/logger.js';
import { createMcpMongoAdapter, createMcpSqlAdapter } from './adapters/factory.js';
import { MCP_ERROR_CODE, McpToolError } from './errors.js';
import type { McpMongoAdapter, McpSqlAdapter } from './types.js';

type Entry = {
  kind: 'sql' | 'mongo';
  sql?: McpSqlAdapter;
  mongo?: McpMongoAdapter;
  inflight: number;
};

export type McpConnection = { kind: 'sql'; adapter: McpSqlAdapter } | { kind: 'mongo'; adapter: McpMongoAdapter };

// Owns MCP-only adapter instances keyed by profile id, re-checks the allowlist
// on every call, enforces the per-profile concurrency cap, and closes adapters
// when a profile is toggled off, edited, or deleted.
export class McpAdapterManager {
  private readonly entries = new Map<string, Entry>();

  private entryFor(profile: ConnectionProfile): Entry {
    let entry = this.entries.get(profile.id);
    if (!entry) {
      entry = { kind: profile.kind === KIND.MONGODB ? 'mongo' : 'sql', inflight: 0 };
      this.entries.set(profile.id, entry);
    }
    return entry;
  }

  async withConnection<T>(connectionId: string, fn: (connection: McpConnection) => Promise<T>): Promise<T> {
    const profile = getProfile(connectionId);
    if (!profile) {
      throw new McpToolError(MCP_ERROR_CODE.PROFILE_NOT_FOUND, `Unknown connection: ${connectionId}`);
    }
    if (!profile.mcpEnabled || !isMcpSupportedKind(profile.kind)) {
      throw new McpToolError(MCP_ERROR_CODE.PROFILE_NOT_ENABLED, 'This connection is not enabled for MCP');
    }

    const entry = this.entryFor(profile);
    if (entry.inflight >= MCP_MAX_CONCURRENT_CALLS_PER_PROFILE) {
      throw new McpToolError(MCP_ERROR_CODE.BUSY, 'Too many concurrent MCP calls for this connection; retry shortly');
    }

    entry.inflight++;
    try {
      if (entry.kind === 'mongo') {
        if (!entry.mongo) {
          entry.mongo = createMcpMongoAdapter(profile) ?? undefined;
          if (!entry.mongo) {
            throw new McpToolError(MCP_ERROR_CODE.PROFILE_NOT_ENABLED, 'MongoDB connection is not configured');
          }
        }
        return await fn({ kind: 'mongo', adapter: entry.mongo });
      }

      if (!entry.sql) {
        entry.sql = createMcpSqlAdapter(profile, getProfilePassword(profile.id)) ?? undefined;
        if (!entry.sql) {
          throw new McpToolError(MCP_ERROR_CODE.PROFILE_NOT_ENABLED, 'This engine is not supported for MCP');
        }
      }
      return await fn({ kind: 'sql', adapter: entry.sql });
    } finally {
      entry.inflight--;
    }
  }

  // Drop and close the cached adapter so a disabled/edited/deleted profile
  // cannot keep serving calls through a stale connection.
  invalidate(connectionId: string): void {
    const entry = this.entries.get(connectionId);
    if (!entry) return;
    this.entries.delete(connectionId);
    if (entry.sql) {
      void entry.sql.close().catch((err) => log.debug({ err }, 'MCP adapter close failed'));
    }
    if (entry.mongo) {
      void entry.mongo.close().catch((err) => log.debug({ err }, 'MCP adapter close failed'));
    }
  }

  async closeAll(): Promise<void> {
    const entries = [...this.entries.values()];
    this.entries.clear();
    await Promise.allSettled(
      entries.flatMap((entry) => {
        const closers: Promise<void>[] = [];
        if (entry.sql) closers.push(entry.sql.close());
        if (entry.mongo) closers.push(entry.mongo.close());
        return closers.map((closer) => closer.catch(() => undefined));
      }),
    );
  }
}
