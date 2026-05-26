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

    async close(): Promise<void> {
      if (client) {
        await client.quit();
        client = null;
      }
    },
  };
}
