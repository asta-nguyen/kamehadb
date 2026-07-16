import type { ColumnInfo, IndexInfo, SqlAdapter } from '@kamehadb/shared';

/** Render DDL for a single table (CREATE TABLE + indexes). Shared by
 * buildSchemaContext (full schema) and buildTableSchemaContext (single table)
 * so both produce identical formatting. */
function renderTableDdl(table: { name: string; schema?: string }, columns: ColumnInfo[], indexes: IndexInfo[]): string {
  const lines: string[] = [];
  lines.push(`CREATE TABLE ${table.schema ? `${table.schema}.` : ''}${table.name} (`);
  const colLines = columns.map((col) => {
    const parts = [`  ${col.name} ${col.type}`];
    if (!col.nullable) parts.push('NOT NULL');
    if (col.default !== null && col.default !== undefined) {
      parts.push(`DEFAULT ${col.default}`);
    }
    if (col.primaryKey) parts.push('PRIMARY KEY');
    if (col.foreignKey) {
      const refSchema = col.foreignKey.schema ? `${col.foreignKey.schema}.` : '';
      parts.push(`REFERENCES ${refSchema}${col.foreignKey.table}(${col.foreignKey.column})`);
    }
    return parts.join(' ');
  });
  lines.push(colLines.join(',\n'));
  lines.push(');');

  for (const idx of indexes) {
    if (idx.primary) continue;
    const unique = idx.unique ? 'UNIQUE ' : '';
    lines.push(
      `CREATE ${unique}INDEX ${idx.name} ON ${table.schema ? `${table.schema}.` : ''}${table.name} (${idx.columns.join(', ')});`,
    );
  }

  return lines.join('\n');
}

export async function buildSchemaContext(adapter: SqlAdapter): Promise<string> {
  const schemas = await adapter.listSchemas();
  const lines: string[] = [];

  for (const schema of schemas) {
    const tables = await adapter.listTables(schema.name);
    for (const table of tables) {
      const columns = await adapter.getTableColumns(table.id);
      const indexes = await adapter.getTableIndexes(table.id);
      lines.push(renderTableDdl(table, columns, indexes));
      lines.push('');
    }
  }

  return lines.join('\n');
}

/** Build DDL for a single table by tableId. Used by the /ai/chat route when
 * a schema-tree right-click AI action provides a tableId — this scopes the
 * system prompt to just that table instead of the full schema, saving tokens
 * and keeping the AI focused. Returns null if the table is not found. */
export async function buildTableSchemaContext(adapter: SqlAdapter, tableId: string): Promise<string | null> {
  // Find the table across all schemas by id. listTables returns TableInfo
  // with id, name, and optional schema.
  const schemas = await adapter.listSchemas();
  for (const schema of schemas) {
    const tables = await adapter.listTables(schema.name);
    const table = tables.find((t) => t.id === tableId);
    if (table) {
      const columns = await adapter.getTableColumns(tableId);
      const indexes = await adapter.getTableIndexes(tableId);
      return renderTableDdl(table, columns, indexes);
    }
  }
  return null;
}
