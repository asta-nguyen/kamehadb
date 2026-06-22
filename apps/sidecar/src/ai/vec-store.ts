import type { SqlAdapter, AIProvider, AIProviderConfig } from '@kamehadb/shared';
import { createEmbedding } from './provider.js';
import crypto from 'node:crypto';
import { getDb } from '../db/metadata-store.js';

const EMBEDDING_DIM = 1536;

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

function toFloat32Array(values: number[]): Float32Array {
  return new Float32Array(values);
}

function ensureVecTable(dimension: number): void {
  const db = getDb();
  // Check if schema_vec exists and has the right dimension
  try {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='schema_vec'").get() as
      | { sql: string }
      | undefined;
    if (row?.sql && row.sql.includes(`float[${dimension}]`)) {
      return; // Table exists with correct dimension
    }
    if (row?.sql) {
      // Dimension mismatch — recreate
      db.exec('DROP TABLE IF EXISTS schema_vec');
      db.exec('DELETE FROM schema_embeddings');
    }
  } catch {
    // Table doesn't exist
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS schema_vec USING vec0(
      connection_id TEXT,
      table_id TEXT,
      embedding float[${dimension}]
    );
  `);
}

function getExistingHashes(connectionId: string): Map<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT table_id, hash FROM schema_embeddings WHERE connection_id = ?').all(connectionId) as {
    table_id: string;
    hash: string;
  }[];
  return new Map(rows.map((r) => [r.table_id, r.hash]));
}

function deleteOrphanedRows(connectionId: string, validTableIds: Set<string>): void {
  const db = getDb();
  const rows = db.prepare('SELECT table_id FROM schema_embeddings WHERE connection_id = ?').all(connectionId) as {
    table_id: string;
  }[];
  const orphans = rows.filter((r) => !validTableIds.has(r.table_id)).map((r) => r.table_id);
  if (orphans.length === 0) return;

  const deleteEmbedding = db.prepare('DELETE FROM schema_embeddings WHERE connection_id = ? AND table_id = ?');
  const deleteVec = db.prepare('DELETE FROM schema_vec WHERE connection_id = ? AND table_id = ?');
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) {
      deleteEmbedding.run(connectionId, id);
      deleteVec.run(connectionId, id);
    }
  });
  tx(orphans);
  console.log(`[VecStore] Deleted ${orphans.length} orphaned entries for ${connectionId}`);
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

  const existingMap = force ? null : getExistingHashes(connectionId);

  const toEmbed = existingMap
    ? items.filter((item) => {
        const existing = existingMap.get(item.tableId);
        return !existing || existing !== item.hash;
      })
    : items;

  if (toEmbed.length === 0) {
    deleteOrphanedRows(connectionId, new Set(items.map((i) => i.tableId)));
    return 0;
  }

  const first = await createEmbedding(toEmbed[0].enriched, provider, config);
  ensureVecTable(first.length);

  const db = getDb();
  const deleteRow = db.prepare('DELETE FROM schema_embeddings WHERE connection_id = ? AND table_id = ?');
  const deleteVec = db.prepare('DELETE FROM schema_vec WHERE connection_id = ? AND table_id = ?');
  const insertEmbedding = db.prepare(
    'INSERT OR REPLACE INTO schema_embeddings (connection_id, table_id, ddl, hash) VALUES (?, ?, ?, ?)',
  );
  const insertVec = db.prepare('INSERT INTO schema_vec (connection_id, table_id, embedding) VALUES (?, ?, ?)');

  const allVectors: number[][] = [first];
  const batchSize = 20;
  for (let i = 1; i < toEmbed.length; i += batchSize) {
    const batch = toEmbed.slice(i, i + batchSize);
    const embeddings = await Promise.all(batch.map((item) => createEmbedding(item.enriched, provider, config)));
    allVectors.push(...embeddings);
  }

  for (let i = 0; i < toEmbed.length; i++) {
    const item = toEmbed[i];
    const vec = allVectors[i];
    const float32 = toFloat32Array(vec);

    deleteRow.run(connectionId, item.tableId);
    deleteVec.run(connectionId, item.tableId);
    insertEmbedding.run(connectionId, item.tableId, item.enriched, item.hash);
    insertVec.run(connectionId, item.tableId, float32);
  }

  if (!force) {
    deleteOrphanedRows(connectionId, new Set(items.map((i) => i.tableId)));
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
  const float32 = toFloat32Array(queryVector);

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT v.table_id, e.ddl, v.distance
       FROM schema_vec v
       JOIN schema_embeddings e ON e.connection_id = v.connection_id AND e.table_id = v.table_id
       WHERE v.connection_id = ?
       ORDER BY v.embedding <=> ?
       LIMIT ?`,
    )
    .all(connectionId, float32, topK) as { table_id: string; ddl: string; distance: number }[];

  return rows.map((r) => ({
    tableId: r.table_id,
    ddl: r.ddl,
    score: 1 - r.distance,
  }));
}

export function collectionPointCount(connectionId: string): number {
  const db = getDb();
  const row = db
    .prepare('SELECT COUNT(*) as count FROM schema_embeddings WHERE connection_id = ?')
    .get(connectionId) as { count: number };
  return row.count;
}
