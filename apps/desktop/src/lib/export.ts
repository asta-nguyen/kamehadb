import type { QueryResult } from '@kamehadb/shared';
import { quoteSqlIdentifier, safeErrorMessage } from '@kamehadb/shared';
import { api } from '@/lib/api';
import { toastError, toastInfo, toastSuccess } from '@/lib/toast';

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

function exportToCSV(result: QueryResult): string {
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

function exportToSQL(result: QueryResult, tableName = 'exported_data'): string {
  if (result.columns.length === 0 || result.rows.length === 0) {
    return `-- No data to export`;
  }

  const columns = result.columns.map((col) => quoteSqlIdentifier(col.name)).join(', ');
  const statements = result.rows.map((row) => {
    const values = result.columns.map((col) => valueToSQL(row[col.name])).join(', ');
    return `INSERT INTO ${quoteSqlIdentifier(tableName)} (${columns}) VALUES (${values});`;
  });

  return [`-- Export from ${tableName}`, `-- ${result.rows.length} rows`, '', ...statements].join('\n');
}

// WebKitGTK has no download handling, so exports are written by the backend
// after the native save dialog — blob downloads are silently ignored there.
export async function saveTextAs(
  content: string,
  filename: string,
  filterName: string,
  pattern: string,
  rowCount: number,
): Promise<void> {
  try {
    const path = await api.saveTextFile(filename, `Export ${rowCount.toLocaleString()} rows`, content, {
      displayName: filterName,
      pattern,
    });
    if (!path) {
      toastInfo('Export cancelled');
      return;
    }
    toastSuccess(`Exported ${rowCount.toLocaleString()} rows to ${path}`);
  } catch (error) {
    toastError(safeErrorMessage(error, 'Export failed'));
  }
}

export async function downloadResult(result: QueryResult, format: ExportFormat): Promise<void> {
  const timestamp = new Date().toISOString().split('T')[0];
  const extensions: Record<ExportFormat, string> = {
    csv: 'csv',
    json: 'json',
    sql: 'sql',
  };
  const filterNames: Record<ExportFormat, string> = {
    csv: 'CSV files',
    json: 'JSON files',
    sql: 'SQL files',
  };

  const exporters: Record<ExportFormat, () => string> = {
    csv: () => exportToCSV(result),
    json: () => exportToJSON(result),
    sql: () => exportToSQL(result),
  };

  await saveTextAs(
    exporters[format](),
    `export_${timestamp}.${extensions[format]}`,
    filterNames[format],
    `*.${extensions[format]}`,
    result.rows.length,
  );
}
