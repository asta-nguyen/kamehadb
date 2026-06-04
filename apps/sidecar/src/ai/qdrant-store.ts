import type { SqlAdapter, AIProvider, AIProviderConfig } from '@kamehadb/shared';
import { createEmbedding } from './provider.js';
import crypto from 'node:crypto';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

function collectionName(connectionId: string): string {
  return `schema_${connectionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
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

type Column = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  primaryKey: boolean;
  foreignKey?: { table: string; column: string };
};

type Index = {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
};

type Table = { name: string; schema?: string };

function inferColumnPurpose(col: Column): string {
  const n = col.name.toLowerCase();

  if (col.foreignKey) return `References ${col.foreignKey.table}(${col.foreignKey.column})`;
  if (n === 'id') return 'Primary key, unique row identifier';
  if (n.endsWith('_id')) return 'Foreign key reference to related entity';
  if (n === 'name' || n === 'title') return 'Human-readable label or display name';
  if (n === 'email' || n.endsWith('_email')) return 'Email address';
  if (n.includes('phone') || n.includes('mobile') || n.includes('telephone')) return 'Phone number';
  if (
    n.includes('address') ||
    n === 'street' ||
    n === 'city' ||
    n === 'state' ||
    n.includes('zip') ||
    n === 'country' ||
    n === 'region'
  )
    return 'Address or location component';
  if (
    n === 'price' ||
    n === 'cost' ||
    n === 'amount' ||
    n === 'total' ||
    n === 'fee' ||
    n === 'salary' ||
    n === 'rate' ||
    n.includes('price') ||
    n.includes('amount')
  )
    return 'Monetary value';
  if (
    n === 'created_at' ||
    n === 'updated_at' ||
    n === 'deleted_at' ||
    n.includes('date') ||
    n.includes('timestamp') ||
    n === 'created_date' ||
    n === 'modified_date'
  )
    return 'Timestamp or date value';
  if (n === 'status' || n.endsWith('_status') || n === 'state') return 'Current status or state of the record';
  if (n === 'type' || n === 'category' || n === 'kind' || n.endsWith('_type') || n.endsWith('_category'))
    return 'Classification or category label';
  if (
    n === 'description' ||
    n === 'desc' ||
    n === 'comment' ||
    n === 'notes' ||
    n === 'note' ||
    n.endsWith('_description')
  )
    return 'Detailed textual description or notes';
  if (n.includes('url') || n.includes('link') || n === 'website' || n === 'web') return 'URL or web link';
  if (n === 'count' || n === 'quantity' || n === 'qty' || n.endsWith('_count') || n.endsWith('_quantity'))
    return 'Numeric count or quantity';
  if (
    n === 'active' ||
    n === 'enabled' ||
    n === 'disabled' ||
    n.startsWith('is_') ||
    n.startsWith('has_') ||
    n.endsWith('_flag')
  )
    return 'Boolean indicator or flag';
  if (n.includes('password') || n === 'pwd' || n === 'secret') return 'Sensitive credential (handle with care)';
  if (n === 'token' || n.endsWith('_token')) return 'Authentication or session token';
  if (n === 'slug' || n.endsWith('_slug')) return 'URL-friendly unique identifier';
  if (n === 'code' || n.endsWith('_code')) return 'Short code or enumerated value';

  return `${col.type}`;
}

function inferTablePurpose(table: Table, columns: Column[]): string {
  const name = table.name.toLowerCase().replace(/_/g, ' ');

  const foreignKeyCount = columns.filter((c) => c.foreignKey).length;
  if (foreignKeyCount >= 2 && columns.length <= 6) {
    return `Junction or association table linking multiple related entities`;
  }

  if (name.endsWith('s')) {
    const singular = name.slice(0, -1);
    return `Stores ${singular} records`;
  }

  return `Contains ${name} data`;
}

function buildTableDdl(table: Table, columns: Column[], indexes: Index[]): string {
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

function buildEnrichedText(table: Table, columns: Column[], indexes: Index[]): string {
  const fullName = table.schema ? `${table.schema}.${table.name}` : table.name;
  const lines: string[] = [];

  lines.push(`Table: ${fullName}`);
  lines.push(`Purpose: ${inferTablePurpose(table, columns)}`);
  lines.push('');
  lines.push('Columns:');
  for (const col of columns) {
    lines.push(`- ${col.name} (${col.type}): ${inferColumnPurpose(col)}`);
  }
  lines.push('');
  lines.push('DDL:');
  lines.push(buildTableDdl(table, columns, indexes));

  return lines.join('\n');
}

function computeTableHash(table: Table, columns: Column[], indexes: Index[]): string {
  const h = crypto.createHash('sha256');
  h.update(table.schema ?? '');
  h.update(table.name);
  for (const col of columns) {
    h.update(col.name);
    h.update(col.type);
    h.update(col.nullable ? '1' : '0');
    h.update(col.default ?? '');
    h.update(col.primaryKey ? '1' : '0');
    h.update(col.foreignKey ? `${col.foreignKey.table}.${col.foreignKey.column}` : '');
    h.update('\x00');
  }
  for (const idx of indexes) {
    h.update(idx.name);
    h.update(idx.columns.join(','));
    h.update(idx.unique ? '1' : '0');
    h.update(idx.primary ? '1' : '0');
    h.update('\x00');
  }
  return h.digest('hex');
}

async function ensureCollection(connectionId: string, dimension: number): Promise<void> {
  const name = collectionName(connectionId);
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

async function collectionPointCount(connectionId: string): Promise<number> {
  try {
    const info = await qdrantRequest(`/collections/${collectionName(connectionId)}`);
    return info.result?.points_count ?? 0;
  } catch {
    return 0;
  }
}

async function getAllPointsMap(connectionId: string): Promise<Map<string, { hash: string }>> {
  const map = new Map<string, { hash: string }>();
  try {
    let offset: unknown = undefined;
    for (;;) {
      const body: Record<string, unknown> = { limit: 100, with_payload: true };
      if (offset !== undefined) body.offset = offset;
      const result = await qdrantRequest(`/collections/${collectionName(connectionId)}/points/scroll`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const points = result.result?.points ?? [];
      for (const p of points) {
        if (p.payload?.tableId) {
          map.set(p.payload.tableId, { hash: p.payload.hash ?? '' });
        }
      }
      offset = result.result?.next_page_offset;
      if (offset === undefined || offset === null) break;
    }
  } catch {
    // Collection may not exist yet
  }
  return map;
}

async function deleteOrphanedPoints(connectionId: string, validTableIds: Set<string>): Promise<void> {
  const existing = await getAllPointsMap(connectionId);
  const orphanIds: string[] = [];
  for (const [tableId] of existing) {
    if (!validTableIds.has(tableId)) {
      orphanIds.push(tableId);
    }
  }
  if (orphanIds.length === 0) return;

  for (let i = 0; i < orphanIds.length; i += 100) {
    await qdrantRequest(`/collections/${collectionName(connectionId)}/points/delete`, {
      method: 'POST',
      body: JSON.stringify({ points: orphanIds.slice(i, i + 100) }),
    }).catch(() => {});
  }
  console.log(`[Qdrant] Deleted ${orphanIds.length} orphaned points from ${collectionName(connectionId)}`);
}

export async function buildSchemaIndex(
  adapter: SqlAdapter,
  connectionId: string,
  provider: AIProvider,
  config: AIProviderConfig,
  force: boolean = false,
): Promise<number> {
  const schemas = await adapter.listSchemas();
  const items: { tableId: string; enriched: string; hash: string }[] = [];

  for (const schema of schemas) {
    const tables = await adapter.listTables(schema.name);
    for (const table of tables) {
      const [columns, indexes] = await Promise.all([
        adapter.getTableColumns(table.id),
        adapter.getTableIndexes(table.id),
      ]);
      const hash = computeTableHash(table, columns, indexes);
      const enriched = buildEnrichedText(table, columns, indexes);
      items.push({ tableId: table.id, enriched, hash });
    }
  }

  if (items.length === 0) return 0;

  const existingMap = force ? null : await getAllPointsMap(connectionId);

  const toEmbed = existingMap
    ? items.filter((item) => {
        const existing = existingMap.get(item.tableId);
        return !existing || existing.hash !== item.hash;
      })
    : items;

  if (toEmbed.length === 0) {
    await deleteOrphanedPoints(connectionId, new Set(items.map((i) => i.tableId)));
    return 0;
  }

  const first = await createEmbedding(toEmbed[0].enriched, provider, config);
  await ensureCollection(connectionId, first.length);

  const allVectors: number[][] = [first];
  const batchSize = 20;
  for (let i = 1; i < toEmbed.length; i += batchSize) {
    const batch = toEmbed.slice(i, i + batchSize);
    const embeddings = await Promise.all(batch.map((item) => createEmbedding(item.enriched, provider, config)));
    allVectors.push(...embeddings);
  }

  for (let i = 0; i < toEmbed.length; i += 20) {
    const batch = toEmbed.slice(i, i + 20);
    const vectors = allVectors.slice(i, i + 20);
    const points = batch.map((item, j) => ({
      id: item.tableId,
      vector: vectors[j],
      payload: { tableId: item.tableId, ddl: item.enriched, hash: item.hash },
    }));
    await qdrantRequest(`/collections/${collectionName(connectionId)}/points`, {
      method: 'PUT',
      body: JSON.stringify({ points }),
    });
  }

  if (!force) {
    await deleteOrphanedPoints(connectionId, new Set(items.map((i) => i.tableId)));
  }

  return toEmbed.length;
}

export async function searchRelevantSchema(
  connectionId: string,
  query: string,
  provider: AIProvider,
  config: AIProviderConfig,
  topK: number = 5,
): Promise<{ tableId: string; ddl: string; score: number }[]> {
  const queryVector = await createEmbedding(query, provider, config);

  const result = await qdrantRequest(`/collections/${collectionName(connectionId)}/points/search`, {
    method: 'POST',
    body: JSON.stringify({
      vector: queryVector,
      limit: topK,
      with_payload: true,
    }),
  });

  return (result.result || []).map((r: any) => ({
    tableId: r.payload?.tableId ?? '',
    ddl: r.payload?.ddl ?? '',
    score: r.score ?? 0,
  }));
}

export { collectionPointCount, collectionName };
