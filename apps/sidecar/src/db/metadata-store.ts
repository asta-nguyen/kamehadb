import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import type { ConnectionProfile } from "@kamehadb/shared";

let db: Database.Database | null = null;

export function initMetadataStore(dbPath: string): void {
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS connection_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('postgres','sqlite','mysql','redis')),
      host TEXT,
      port INTEGER,
      database TEXT,
      username TEXT,
      password TEXT,
      ssl INTEGER DEFAULT 0,
      file_path TEXT,
      readonly INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: Add password column if it doesn't exist
  try {
    db.exec("ALTER TABLE connection_profiles ADD COLUMN password TEXT");
  } catch {
    // Column already exists, ignore
  }
}

function getDb(): Database.Database {
  if (!db) throw new Error("Metadata store not initialized");
  return db;
}

export function listProfiles(): ConnectionProfile[] {
  const rows = getDb()
    .prepare("SELECT * FROM connection_profiles ORDER BY updated_at DESC")
    .all() as Record<string, unknown>[];

  return rows.map(rowToProfile);
}

export function getProfile(id: string): ConnectionProfile | null {
  const row = getDb()
    .prepare("SELECT * FROM connection_profiles WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;

  return row ? rowToProfile(row) : null;
}

export function getProfilePassword(id: string): string | undefined {
  const row = getDb()
    .prepare("SELECT password FROM connection_profiles WHERE id = ?")
    .get(id) as { password: string | null } | undefined;

  return row?.password ?? undefined;
}

export function createProfile(input: {
  name: string;
  kind: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  filePath?: string;
  readonly?: boolean;
}): ConnectionProfile {
  const id = nanoid();
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO connection_profiles (id, name, kind, host, port, database, username, password, ssl, file_path, readonly, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.kind,
      input.host ?? null,
      input.port ?? null,
      input.database ?? null,
      input.username ?? null,
      input.password ?? null,
      input.ssl ? 1 : 0,
      input.filePath ?? null,
      input.readonly !== false ? 1 : 0,
      now,
      now,
    );

  return getProfile(id)!;
}

export function updateProfile(
  id: string,
  input: {
    name?: string;
    kind?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl?: boolean;
    filePath?: string;
    readonly?: boolean;
  },
): ConnectionProfile | null {
  const existing = getProfile(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updates: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  if (input.name !== undefined) { updates.push("name = ?"); values.push(input.name); }
  if (input.kind !== undefined) { updates.push("kind = ?"); values.push(input.kind); }
  if (input.host !== undefined) { updates.push("host = ?"); values.push(input.host); }
  if (input.port !== undefined) { updates.push("port = ?"); values.push(input.port); }
  if (input.database !== undefined) { updates.push("database = ?"); values.push(input.database); }
  if (input.username !== undefined) { updates.push("username = ?"); values.push(input.username); }
  if (input.password !== undefined) { updates.push("password = ?"); values.push(input.password); }
  if (input.ssl !== undefined) { updates.push("ssl = ?"); values.push(input.ssl ? 1 : 0); }
  if (input.filePath !== undefined) { updates.push("file_path = ?"); values.push(input.filePath); }
  if (input.readonly !== undefined) { updates.push("readonly = ?"); values.push(input.readonly ? 1 : 0); }

  values.push(id);
  getDb()
    .prepare(`UPDATE connection_profiles SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values);

  return getProfile(id);
}

export function deleteProfile(id: string): boolean {
  const result = getDb().prepare("DELETE FROM connection_profiles WHERE id = ?").run(id);
  return result.changes > 0;
}

function rowToProfile(row: Record<string, unknown>): ConnectionProfile {
  return {
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as ConnectionProfile["kind"],
    host: (row.host as string) ?? undefined,
    port: (row.port as number) ?? undefined,
    database: (row.database as string) ?? undefined,
    username: (row.username as string) ?? undefined,
    ssl: row.ssl === 1,
    filePath: (row.file_path as string) ?? undefined,
    readonly: row.readonly === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function closeMetadataStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}
