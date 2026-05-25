import type { SqlAdapter } from "@kamehadb/shared";

export async function buildSchemaContext(adapter: SqlAdapter): Promise<string> {
  const schemas = await adapter.listSchemas();
  const lines: string[] = [];

  for (const schema of schemas) {
    const tables = await adapter.listTables(schema.name);
    for (const table of tables) {
      const columns = await adapter.getTableColumns(table.id);
      const indexes = await adapter.getTableIndexes(table.id);

      lines.push(`CREATE TABLE ${table.schema ? `${table.schema}.` : ""}${table.name} (`);
      const colLines = columns.map((col) => {
        const parts = [`  ${col.name} ${col.type}`];
        if (!col.nullable) parts.push("NOT NULL");
        if (col.default !== null && col.default !== undefined) {
          parts.push(`DEFAULT ${col.default}`);
        }
        if (col.primaryKey) parts.push("PRIMARY KEY");
        if (col.foreignKey) {
          parts.push(`REFERENCES ${col.foreignKey.table}(${col.foreignKey.column})`);
        }
        return parts.join(" ");
      });
      lines.push(colLines.join(",\n"));
      lines.push(");");

      for (const idx of indexes) {
        if (idx.primary) continue;
        const unique = idx.unique ? "UNIQUE " : "";
        lines.push(`CREATE ${unique}INDEX ${idx.name} ON ${table.name} (${idx.columns.join(", ")});`);
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}
