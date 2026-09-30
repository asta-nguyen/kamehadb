import Database from 'better-sqlite3';

// Standalone child-process worker for MCP SQLite access. It opens the database
// read-only and serves one JSON request per line on stdin, replying on stdout.
// Running here keeps better-sqlite3's synchronous execution off the sidecar
// event loop so a runaway query can be killed by terminating this process.

type WorkerRequest =
  | { id: number; type: 'query'; query: string; maxRows: number }
  | { id: number; type: 'listDatabases' }
  | { id: number; type: 'listSchemas' }
  | { id: number; type: 'listTables' }
  | { id: number; type: 'getTableColumns'; tableId: string };

type ColumnInfoRow = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

function runRequest(db: Database.Database, request: WorkerRequest): unknown {
  switch (request.type) {
    case 'query': {
      const maxRows = Math.max(1, Math.floor(request.maxRows));
      const statement = db.prepare(request.query);
      const columns = statement.reader
        ? statement.columns().map((column) => ({ name: column.name, type: column.type || 'unknown' }))
        : [];
      const rows: Record<string, unknown>[] = [];
      let truncated = false;
      for (const row of statement.iterate() as Iterable<Record<string, unknown>>) {
        if (rows.length < maxRows) {
          rows.push(row);
          continue;
        }
        truncated = true;
        break;
      }
      return { columns, rows, truncated };
    }
    case 'listDatabases':
      return [{ name: 'main' }];
    case 'listSchemas':
      return [{ name: 'main' }];
    case 'listTables': {
      const rows = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE '%vec0%' ORDER BY name",
        )
        .all() as { name: string }[];
      return rows.map((row) => ({ id: row.name, name: row.name }));
    }
    case 'getTableColumns': {
      const result = db.prepare(`PRAGMA table_info("${request.tableId}")`).all() as ColumnInfoRow[];
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list("${request.tableId}")`).all() as {
        from: string;
        table: string;
        to: string;
      }[];
      const fkMap = new Map(foreignKeys.map((fk) => [fk.from, { table: fk.table, column: fk.to }]));
      return result.map((row) => ({
        name: row.name,
        type: row.type || 'text',
        nullable: !row.notnull,
        default: row.dflt_value,
        primaryKey: row.pk > 0,
        foreignKey: fkMap.get(row.name),
      }));
    }
  }
}

function main(): void {
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write('sqlite-worker: missing database file path\n');
    process.exit(1);
    return;
  }

  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  const send = (message: unknown): void => {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  };

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf('\n');
      if (!line.trim()) continue;

      let request: WorkerRequest;
      try {
        request = JSON.parse(line) as WorkerRequest;
      } catch {
        continue;
      }

      try {
        send({ id: request.id, ok: true, result: runRequest(db, request) });
      } catch (err) {
        send({ id: request.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
  });

  const shutdown = (): void => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.stdin.on('end', shutdown);
}

main();
