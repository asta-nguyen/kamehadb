import { MongoClient, type Collection } from 'mongodb';
import type {
  MongoAdapter,
  TestConnectionResult,
  DatabaseInfo,
  CollectionInfo,
  FindDocumentsInput,
  AggregateInput,
  DocumentResult,
} from '@kamehadb/shared';

interface MongoConfig {
  connectionString: string;
  database?: string;
}

export function createMongoAdapter(config: MongoConfig): MongoAdapter {
  let client: MongoClient | null = null;
  let activeDbName: string | null = null;

  async function ensureConnected(): Promise<MongoClient> {
    if (!client) {
      client = new MongoClient(config.connectionString, {
        serverSelectionTimeoutMS: 5000,
      });
    }
    return client;
  }

  return {
    async testConnection(): Promise<TestConnectionResult> {
      const tempClient = new MongoClient(config.connectionString, {
        serverSelectionTimeoutMS: 5000,
      });
      try {
        await tempClient.connect();
        const adminDb = tempClient.db().admin();
        const result = await adminDb.command({ buildInfo: 1 });
        return {
          success: true,
          serverVersion: `MongoDB ${result.version}`,
        };
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Connection failed',
        };
      } finally {
        await tempClient.close();
      }
    },

    async listDatabases(): Promise<DatabaseInfo[]> {
      const mongoClient = await ensureConnected();
      const adminDb = mongoClient.db().admin();
      const list = await adminDb.command({ listDatabases: 1 });
      return list.databases.map((d: { name: string }) => ({
        name: d.name,
      }));
    },

    async listCollections(database?: string): Promise<CollectionInfo[]> {
      const mongoClient = await ensureConnected();
      const targetDb = database ? mongoClient.db(database) : mongoClient.db(activeDbName || config.database);
      if (!targetDb) throw new Error('No database selected');

      const collections = await targetDb.listCollections().toArray();

      return collections.map((c: { name: string; type?: string }) => ({
        name: c.name,
        type: (c.type || 'collection') as 'collection' | 'view' | 'timeseries',
        documentCount: undefined,
      }));
    },

    async findDocuments(input: FindDocumentsInput): Promise<DocumentResult> {
      const mongoClient = await ensureConnected();
      const targetDb = input.database
        ? mongoClient.db(input.database)
        : mongoClient.db(activeDbName || config.database);
      if (!targetDb) throw new Error('No database selected');

      const collection: Collection = targetDb.collection(input.collection);

      const filter = input.filter || {};
      const projection = input.projection || {};
      const sort = input.sort || {};
      const skip = input.skip || 0;
      const limit = Math.min(input.limit || 100, 1000);

      const cursor = collection.find(filter, {
        projection,
        sort,
        skip,
        limit: limit + 1,
      });

      const documents: Record<string, unknown>[] = [];
      let count = 0;

      for await (const doc of cursor) {
        if (count < limit) {
          const serialized: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(doc)) {
            if (value && typeof value === 'object' && (value as { _bsontype?: string })._bsontype === 'ObjectId') {
              serialized[key] = (value as { toString: () => string }).toString();
            } else if (value instanceof Date) {
              serialized[key] = value.toISOString();
            } else {
              serialized[key] = value;
            }
          }
          documents.push(serialized);
        }
        count++;
      }

      return {
        documents,
        totalCount: count,
        hasMore: count > limit,
      };
    },

    async aggregate(input: AggregateInput): Promise<DocumentResult> {
      const mongoClient = await ensureConnected();
      const targetDb = input.database
        ? mongoClient.db(input.database)
        : mongoClient.db(activeDbName || config.database);
      if (!targetDb) throw new Error('No database selected');

      const collection: Collection = targetDb.collection(input.collection);

      const pipeline = input.pipeline || [];
      const limit = Math.min(input.limit || 100, 1000);

      const finalPipeline = [...pipeline];
      if (!finalPipeline.some((stage) => '$limit' in stage)) {
        finalPipeline.push({ $limit: limit } as Record<string, unknown>);
      }

      const cursor = collection.aggregate(finalPipeline);
      const documents: Record<string, unknown>[] = [];

      for await (const doc of cursor) {
        const serialized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(doc)) {
          if (value && typeof value === 'object' && (value as { _bsontype?: string })._bsontype === 'ObjectId') {
            serialized[key] = (value as { toString: () => string }).toString();
          } else if (value instanceof Date) {
            serialized[key] = value.toISOString();
          } else {
            serialized[key] = value;
          }
        }
        documents.push(serialized);
      }

      return {
        documents,
        totalCount: documents.length,
        hasMore: documents.length >= limit,
      };
    },

    async close(): Promise<void> {
      if (client) {
        await client.close();
        client = null;
        activeDbName = null;
      }
    },
  };
}
