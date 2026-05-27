import type { QueryResult } from '@kamehadb/shared';

export type ExportFormat = 'csv' | 'json' | 'sql';

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[\s]*[=+\-@]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function valueToSQL(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function exportToCSV(result: QueryResult): string {
  const headers = result.columns.map((col) => escapeCSV(col.name));
  const rows = result.rows.map((row) => result.columns.map((col) => escapeCSV(row[col.name])).join(','));
  return [headers.join(','), ...rows].join('\n');
}

export function exportToJSON(result: QueryResult): string {
  const data = result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (const col of result.columns) {
      obj[col.name] = row[col.name];
    }
    return obj;
  });
  return JSON.stringify(data, null, 2);
}

function escapeIdentifier(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

export function exportToSQL(result: QueryResult, tableName = 'exported_data'): string {
  if (result.columns.length === 0 || result.rows.length === 0) {
    return `-- No data to export`;
  }

  const columns = result.columns.map((col) => escapeIdentifier(col.name)).join(', ');
  const statements = result.rows.map((row) => {
    const values = result.columns.map((col) => valueToSQL(row[col.name])).join(', ');
    return `INSERT INTO ${escapeIdentifier(tableName)} (${columns}) VALUES (${values});`;
  });

  return [`-- Export from ${tableName}`, `-- ${result.rows.length} rows`, '', ...statements].join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadResult(result: QueryResult, format: ExportFormat) {
  const timestamp = new Date().toISOString().split('T')[0];
  const extensions: Record<ExportFormat, string> = {
    csv: 'csv',
    json: 'json',
    sql: 'sql',
  };
  const mimeTypes: Record<ExportFormat, string> = {
    csv: 'text/csv',
    json: 'application/json',
    sql: 'application/sql',
  };

  const exporters: Record<ExportFormat, () => string> = {
    csv: () => exportToCSV(result),
    json: () => exportToJSON(result),
    sql: () => exportToSQL(result),
  };

  const content = exporters[format]();
  const filename = `export_${timestamp}.${extensions[format]}`;

  downloadFile(content, filename, mimeTypes[format]);
}
