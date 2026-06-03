import type { SqlAdapter, MongoAdapter, AIProvider, AIProviderConfig, CollectionInfo } from '@kamehadb/shared';
import { createEmbedding } from './provider.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

function collectionName(connectionId: string, prefix: string = 'schema'): string {
  return `${prefix}_${connectionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export function mongoCollectionName(connectionId: string, database: string): string {
  return collectionName(`${connectionId}_${database.replace(/[^a-zA-Z0-9_-]/g, '_')}`, 'schema_mongo');
}

async function qdrantRequest(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${QDRANT_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Qdrant error (${res.status}) at ${path}: ${body}`);
  }
  return res.json();
}

function buildTableDdl(
  table: { name: string; schema?: string },
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    default: string | null;
    primaryKey: boolean;
    foreignKey?: { table: string; column: string };
  }[],
  indexes: { name: string; columns: string[]; unique: boolean; primary: boolean }[],
): string {
  const lines: string[] = [];
  lines.push(`CREATE TABLE ${table.schema ? `${table.schema}.` : ''}${table.name} (`);
  const colLines = columns.map((col) => {
    const parts = [`  ${col.name} ${col.type}`];
    if (!col.nullable) parts.push('NOT NULL');
    if (col.default !== null && col.default !== undefined) parts.push(`DEFAULT ${col.default}`);
    if (col.primaryKey) parts.push('PRIMARY KEY');
    if (col.foreignKey) parts.push(`REFERENCES ${col.foreignKey.table}(${col.foreignKey.column})`);
    return parts.join(' ');
  });
  lines.push(colLines.join(',\n'));
  lines.push(');');

  for (const idx of indexes) {
    if (idx.primary) continue;
    const unique = idx.unique ? 'UNIQUE ' : '';
    lines.push(`CREATE ${unique}INDEX ${idx.name} ON ${table.name} (${idx.columns.join(', ')});`);
  }

  return lines.join('\n');
}

async function ensureCollectionByName(name: string, dimension: number): Promise<void> {
  try {
    const info = await qdrantRequest(`/collections/${name}`);
    const existingDim = info.result?.config?.params?.vectors?.size;
    if (existingDim && existingDim !== dimension) {
      await qdrantRequest(`/collections/${name}`, { method: 'DELETE' });
    } else if (existingDim) {
      return;
    }
  } catch {
    // Collection doesn't exist, create below
  }

  await qdrantRequest(`/collections/${name}`, {
    method: 'PUT',
    body: JSON.stringify({
      vectors: { size: dimension, distance: 'Cosine' },
    }),
  });
}

async function ensureCollection(connectionId: string, dimension: number): Promise<void> {
  return ensureCollectionByName(collectionName(connectionId), dimension);
}

async function collectionPointCount(connectionId: string): Promise<number> {
  try {
    const info = await qdrantRequest(`/collections/${collectionName(connectionId)}`);
    return info.result?.points_count ?? 0;
  } catch {
    return 0;
  }
}

export async function collectionPointCountByName(collection: string): Promise<number> {
  try {
    const info = await qdrantRequest(`/collections/${collection}`);
    return info.result?.points_count ?? 0;
  } catch {
    return 0;
  }
}

export async function buildSchemaIndex(
  adapter: SqlAdapter,
  connectionId: string,
  provider: AIProvider,
  config: AIProviderConfig,
): Promise<number> {
  const schemas = await adapter.listSchemas();
  const items: { tableId: string; ddl: string }[] = [];

  for (const schema of schemas) {
    const tables = await adapter.listTables(schema.name);
    for (const table of tables) {
      const [columns, indexes] = await Promise.all([
        adapter.getTableColumns(table.id),
        adapter.getTableIndexes(table.id),
      ]);
      const ddl = buildTableDdl(table, columns, indexes);
      items.push({ tableId: table.id, ddl });
    }
  }

  if (items.length === 0) return 0;

  // Get dimension from first embedding
  const first = await createEmbedding(items[0].ddl, provider, config);
  await ensureCollection(connectionId, first.length);

  // Embed all DDLs in batches of 20
  const allVectors: number[][] = [first];
  const batchSize = 20;
  for (let i = 1; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const embeddings = await Promise.all(batch.map((item) => createEmbedding(item.ddl, provider, config)));
    allVectors.push(...embeddings);
  }

  // Upsert to Qdrant in batches of 20
  for (let i = 0; i < items.length; i += 20) {
    const batch = items.slice(i, i + 20);
    const vectors = allVectors.slice(i, i + 20);
    const points = batch.map((item, j) => ({
      id: i + j + 1,
      vector: vectors[j],
      payload: { tableId: item.tableId, ddl: item.ddl },
    }));
    await qdrantRequest(`/collections/${collectionName(connectionId)}/points`, {
      method: 'PUT',
      body: JSON.stringify({ points }),
    });
  }

  return items.length;
}

export async function searchRelevantSchema(
  connectionId: string,
  query: string,
  provider: AIProvider,
  config: AIProviderConfig,
  topK: number = 5,
): Promise<{ tableId: string; ddl: string; score: number }[]> {
  return searchCollection(collectionName(connectionId), query, provider, config, topK);
}

export async function searchCollection(
  collection: string,
  query: string,
  provider: AIProvider,
  config: AIProviderConfig,
  topK: number = 5,
): Promise<{ tableId: string; ddl: string; score: number }[]> {
  const queryVector = await createEmbedding(query, provider, config);
  const result = await qdrantRequest(`/collections/${collection}/points/search`, {
    method: 'POST',
    body: JSON.stringify({
      vector: queryVector,
      limit: topK,
      with_payload: true,
    }),
  });

  return (result.result || []).map((r: any) => ({
    tableId: r.payload?.tableId ?? r.payload?.collectionName ?? '',
    ddl: r.payload?.ddl ?? r.payload?.schema ?? '',
    score: r.score ?? 0,
  }));
}

export async function buildMongoSchemaIndex(
  adapter: MongoAdapter,
  connectionId: string,
  database: string,
  provider: AIProvider,
  config: AIProviderConfig,
): Promise<number> {
  const collections = await adapter.listCollections(database);
  const items: { collectionName: string; schema: string }[] = [];

  for (const coll of collections) {
    if (coll.type !== 'collection') continue;
    const stats = await adapter.getCollectionStats(database, coll.name);
    if (stats.documentCount === 0) continue;

    const result = await adapter.findDocuments({
      collection: coll.name,
      database,
      limit: 1,
    });
    if (result.documents.length === 0) continue;

    const sample = result.documents[0];
    const fields = Object.keys(sample)
      .slice(0, 20)
      .map((k) => {
        const v = sample[k];
        const type = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
        return `  ${k}: ${type}`;
      });

    items.push({
      collectionName: coll.name,
      schema: `Collection: ${database}.${coll.name} (${stats.documentCount.toLocaleString()} docs)\nFields:\n${fields.join('\n')}`,
    });
  }

  if (items.length === 0) return 0;

  const coll = mongoCollectionName(connectionId, database);
  const first = await createEmbedding(items[0].schema, provider, config);
  await ensureCollectionByName(coll, first.length);

  // Embed all schemas in batches of 20
  const allVectors: number[][] = [first];
  const batchSize = 20;
  for (let i = 1; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const embeddings = await Promise.all(batch.map((item) => createEmbedding(item.schema, provider, config)));
    allVectors.push(...embeddings);
  }

  // Upsert to Qdrant in batches of 20
  for (let i = 0; i < items.length; i += 20) {
    const batch = items.slice(i, i + 20);
    const vectors = allVectors.slice(i, i + 20);
    const points = batch.map((item, j) => ({
      id: i + j + 1,
      vector: vectors[j],
      payload: { collectionName: item.collectionName, schema: item.schema },
    }));
    await qdrantRequest(`/collections/${coll}/points`, {
      method: 'PUT',
      body: JSON.stringify({ points }),
    });
  }

  return items.length;
}

export { collectionPointCount, collectionName };
