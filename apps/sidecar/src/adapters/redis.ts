import Redis from 'ioredis';
import type {
  RedisAdapter,
  TestConnectionResult,
  KeyPage,
  RedisValue,
  ScanKeysInput,
  GetKeyInput,
  GetTtlInput,
  KeyEntry,
  RedisStats,
  RedisCommandResult,
} from '@kamehadb/shared';

interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  database?: number;
}

export function createRedisAdapter(config: RedisConfig): RedisAdapter {
  let client: Redis | null = null;

  function getClient(): Redis {
    if (!client) {
      client = new Redis({
        host: config.host ?? 'localhost',
        port: config.port ?? 6379,
        password: config.password || undefined,
        db: config.database ?? 0,
        lazyConnect: true,
        connectTimeout: 5000,
      });
    }
    return client;
  }

  async function getKeyDetails(
    key: string,
  ): Promise<{ type: string; value: unknown; ttl: number; sizeBytes?: number }> {
    const redis = getClient();
    const type = await redis.type(key);
    const ttl = await redis.ttl(key);
    let value: unknown;

    switch (type) {
      case 'string':
        value = await redis.get(key);
        break;
      case 'list':
        value = await redis.lrange(key, 0, -1);
        break;
      case 'set':
        value = await redis.smembers(key);
        break;
      case 'zset':
        value = await redis.zrange(key, 0, -1, 'WITHSCORES');
        break;
      case 'hash':
        value = await redis.hgetall(key);
        break;
      default:
        value = null;
    }

    let sizeBytes: number | undefined;
    try {
      sizeBytes = ((await redis.memory('USAGE', key)) as number) ?? undefined;
    } catch {
      // memory command not available on all Redis versions
    }

    return { type, value, ttl, sizeBytes };
  }

  return {
    async testConnection(): Promise<TestConnectionResult> {
      const redis = getClient();
      try {
        await redis.ping();
        const info = await redis.info('server');
        const versionMatch = info.match(/redis_version:([\d.]+)/);
        const version = versionMatch ? `Redis ${versionMatch[1]}` : 'Redis';
        return { success: true, serverVersion: version };
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Connection failed',
        };
      }
    },

    async scanKeys(input: ScanKeysInput): Promise<KeyPage> {
      const redis = getClient();
      const cursor = String(input.cursor ?? 0);
      const count = input.count ?? 100;
      const pattern = input.pattern ?? '*';

      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);

      const keyEntries: KeyEntry[] = await Promise.all(
        keys.map(async (key) => {
          const type = await redis.type(key);
          const ttl = await redis.ttl(key);
          return {
            key,
            type: type as KeyEntry['type'],
            ttl,
          };
        }),
      );

      return {
        keys: keyEntries,
        cursor: parseInt(nextCursor, 10),
        done: nextCursor === '0',
      };
    },

    async getKey(input: GetKeyInput): Promise<RedisValue> {
      const details = await getKeyDetails(input.key);
      return {
        key: input.key,
        type: details.type as RedisValue['type'],
        ttl: details.ttl,
        value: details.value,
      };
    },

    async getTtl(input: GetTtlInput): Promise<number> {
      const redis = getClient();
      return await redis.ttl(input.key);
    },

    async getStats(): Promise<RedisStats> {
      const redis = getClient();
      const info = await redis.info('all');

      const parseInfo = (section: string): Record<string, string> => {
        const match = info.match(new RegExp(`# ${section}([\\s\\S]*?)(?=# |$)`));
        if (!match) return {};
        const result: Record<string, string> = {};
        for (const line of match[1].split('\n')) {
          const [key, ...valParts] = line.split(':');
          if (key && valParts.length) {
            result[key.trim()] = valParts.join(':').trim();
          }
        }
        return result;
      };

      const server = parseInfo('Server');
      const clients = parseInfo('Clients');
      const memory = parseInfo('Memory');
      const stats = parseInfo('Stats');
      const keyspace = parseInfo('Keyspace');

      // Parse keyspace info (format: db0:keys=123,expires=5,avg_ttl=3600000)
      let totalKeys = 0;
      let totalExpiring = 0;
      let avgTtl = 0;
      for (const line of info.split('\n')) {
        const km = line.match(/^db(\d+):keys=(\d+),expires=(\d+),avg_ttl=(\d+)/);
        if (km) {
          totalKeys += parseInt(km[2], 10);
          totalExpiring += parseInt(km[3], 10);
          avgTtl = parseInt(km[4], 10) || avgTtl;
        }
      }

      return {
        version: server.redis_version || 'unknown',
        connectedClients: parseInt(clients.connected_clients || '0', 10),
        blockedClients: parseInt(clients.blocked_clients || '0', 10),
        totalConnections: parseInt(stats.total_connections_received || '0', 10),
        totalCommands: parseInt(stats.total_commands_processed || '0', 10),
        usedMemory: parseInt(memory.used_memory || '0', 10),
        usedMemoryPeak: parseInt(memory.used_memory_peak || '0', 10),
        maxMemory: memory.maxmemory ? parseInt(memory.maxmemory, 10) : undefined,
        totalKeys,
        expiringKeys: totalExpiring,
        avgTtl,
        uptimeSeconds: parseInt(server.uptime_in_seconds || '0', 10),
        hitRate:
          stats.keyspace_hits && stats.keyspace_misses
            ? (() => {
                const hits = parseInt(stats.keyspace_hits, 10);
                const misses = parseInt(stats.keyspace_misses, 10);
                const total = hits + misses;
                return total > 0 ? (hits / total) * 100 : 0;
              })()
            : undefined,
      };
    },

    async runCommand(command: string): Promise<RedisCommandResult> {
      const redis = getClient();
      const trimmed = command.trim();
      const parts = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
      if (parts.length === 0) throw new Error('Empty command');
      const cmd = parts[0]!;
      const args = parts.slice(1).map((a) => a.replace(/^["']|["']$/g, ''));
      const start = Date.now();
      const result = await redis.call(cmd, ...args);
      return { result, command: trimmed, durationMs: Date.now() - start };
    },

    async close(): Promise<void> {
      if (client) {
        await client.quit();
        client = null;
      }
    },
  };
}
