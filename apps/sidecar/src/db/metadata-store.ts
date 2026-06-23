import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { LRUCache } from 'lru-cache';
import { nanoid } from 'nanoid';
import type { ConnectionProfile, AIProvider, AISettings, AIProviderConfig } from '@kamehadb/shared';

let db: Database.Database | null = null;
const aiSettingsCache = new LRUCache<string, AISettings>({ max: 1, ttl: 1000 * 60 * 5 });
const DEFAULT_AI_PROVIDER = 'openai' satisfies AIProvider;

function createDefaultAISettings(): AISettings {
  return {
    activeProvider: DEFAULT_AI_PROVIDER,
    providers: {
      'ollama-local': {
        enabled: false,
        model: 'llama3.1',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
      },
      'ollama-cloud': {
        enabled: false,
        model: '',
        baseUrl: '',
        apiKey: '',
      },
      openai: {
        enabled: false,
        model: 'gpt-4o',
        baseUrl: '',
        apiKey: '',
      },
      '9router': {
        enabled: false,
        model: '',
        baseUrl: '',
        apiKey: '',
      },
    },
  };
}

export function initMetadataStore(dbPath: string): void {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  try {
    sqliteVec.load(db);
  } catch (e) {
    console.warn('[MetadataStore] sqlite-vec extension failed to load:', e instanceof Error ? e.message : e);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS connection_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('postgres','sqlite','mysql','redis','mongodb','qdrant','sqlserver','oracle','clickhouse')),
      host TEXT,
      port INTEGER,
      database TEXT,
      username TEXT,
      password TEXT,
      ssl INTEGER DEFAULT 0,
          file_path TEXT,
          color TEXT,
      connection_string TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: Add password column if it doesn't exist
  try {
    db.exec('ALTER TABLE connection_profiles ADD COLUMN password TEXT');
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add color column if it doesn't exist
  try {
    db.exec('ALTER TABLE connection_profiles ADD COLUMN color TEXT');
  } catch {
    // Column already exists, ignore
  }

  // Migration: Add connection_string column if it doesn't exist
  try {
    db.exec('ALTER TABLE connection_profiles ADD COLUMN connection_string TEXT');
  } catch {
    // Column already exists, ignore
  }

  // Migration: widen the kind CHECK constraint to include newer engines (e.g. qdrant).
  // SQLite bakes CHECK constraints into the table definition, so existing databases
  // must rebuild the table to accept the new kind. Runs after the column migrations
  // above so every column exists to copy.
  const profilesSql = (
    db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='connection_profiles'").get() as
      | { sql: string }
      | undefined
  )?.sql;
  // Migration: widen the kind CHECK constraint to include sqlserver/oracle/clickhouse.
  if (profilesSql && !profilesSql.includes('clickhouse')) {
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE connection_profiles_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('postgres','sqlite','mysql','redis','mongodb','qdrant','sqlserver','oracle','clickhouse','tigerbeetle')),
        host TEXT,
        port INTEGER,
        database TEXT,
        username TEXT,
        password TEXT,
        ssl INTEGER DEFAULT 0,
        file_path TEXT,
        color TEXT,
        connection_string TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO connection_profiles_new
        SELECT id, name, kind, host, port, database, username, password, ssl, file_path,
               color, connection_string, created_at, updated_at
        FROM connection_profiles;
      DROP TABLE connection_profiles;
      ALTER TABLE connection_profiles_new RENAME TO connection_profiles;
      COMMIT;
    `);
  }

  if (profilesSql && !profilesSql.includes('qdrant')) {
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE connection_profiles_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('postgres','sqlite','mysql','redis','mongodb','qdrant','sqlserver','oracle','clickhouse')),
        host TEXT,
        port INTEGER,
        database TEXT,
        username TEXT,
        password TEXT,
        ssl INTEGER DEFAULT 0,
        file_path TEXT,
        color TEXT,
        connection_string TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO connection_profiles_new
        SELECT id, name, kind, host, port, database, username, password, ssl, file_path,
               color, connection_string, created_at, updated_at
        FROM connection_profiles;
      DROP TABLE connection_profiles;
      ALTER TABLE connection_profiles_new RENAME TO connection_profiles;
      COMMIT;
    `);
  }

  // Migration: widen the kind CHECK constraint to include mariadb and duckdb.
  if (profilesSql && !profilesSql.includes('mariadb')) {
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE connection_profiles_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('postgres','sqlite','mysql','redis','mongodb','qdrant','sqlserver','oracle','clickhouse','mariadb','duckdb','tigerbeetle')),
        host TEXT,
        port INTEGER,
        database TEXT,
        username TEXT,
        password TEXT,
        ssl INTEGER DEFAULT 0,
        file_path TEXT,
        color TEXT,
        connection_string TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO connection_profiles_new
        SELECT id, name, kind, host, port, database, username, password, ssl, file_path,
               color, connection_string, created_at, updated_at
        FROM connection_profiles;
      DROP TABLE connection_profiles;
      ALTER TABLE connection_profiles_new RENAME TO connection_profiles;
      COMMIT;
    `);
  }

  // Migration: widen the kind CHECK constraint to include tigerbeetle.
  if (profilesSql && !profilesSql.includes('tigerbeetle')) {
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE connection_profiles_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('postgres','sqlite','mysql','redis','mongodb','qdrant','sqlserver','oracle','clickhouse','mariadb','duckdb','tigerbeetle')),
        host TEXT,
        port INTEGER,
        database TEXT,
        username TEXT,
        password TEXT,
        ssl INTEGER DEFAULT 0,
        file_path TEXT,
        color TEXT,
        connection_string TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO connection_profiles_new
        SELECT id, name, kind, host, port, database, username, password, ssl, file_path,
               color, connection_string, created_at, updated_at
        FROM connection_profiles;
      DROP TABLE connection_profiles;
      ALTER TABLE connection_profiles_new RENAME TO connection_profiles;
      COMMIT;
    `);
  }

  // Migrate ai_settings from old single-column schema if needed
  const hasOldSettings = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_settings'")
    .get() as { name: string } | undefined;
  if (hasOldSettings) {
    const colInfo = db.prepare('PRAGMA table_info(ai_settings)').all() as { name: string }[];
    const hasKeyCol = colInfo.some((c) => c.name === 'key');
    if (!hasKeyCol) {
      db.exec('DROP TABLE ai_settings; DROP TABLE IF EXISTS ai_provider_configs;');
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_provider_configs (
      provider TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      model TEXT NOT NULL DEFAULT '',
      base_url TEXT,
      api_key TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      mongo_database TEXT,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_connection ON chat_messages(connection_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS query_history (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      query TEXT NOT NULL,
      executed_at TEXT NOT NULL,
      duration_ms INTEGER,
      row_count INTEGER,
      favorite INTEGER NOT NULL DEFAULT 0,
      name TEXT
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_query_history_connection ON query_history(connection_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_query_history_favorite ON query_history(connection_id, favorite);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_snapshots (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      snapshot_data TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_schema_snaps_conn ON schema_snapshots(connection_id);
  `);

  // Migration: Add mongo_database column if it doesn't exist
  try {
    db.exec('ALTER TABLE chat_messages ADD COLUMN mongo_database TEXT');
  } catch {
    // Column already exists, ignore
  }

  // Migration: Normalize chat_messages.created_at to ISO 8601 format
  // Rows inserted before this migration may have SQLite datetime('now') format (YYYY-MM-DD HH:MM:SS)
  try {
    getDb()
      .prepare(
        `
        UPDATE chat_messages
        SET created_at = printf('%s.000Z', created_at)
        WHERE created_at NOT LIKE '%Z'
          AND created_at NOT LIKE '%+%'
          AND created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] *'
      `,
      )
      .run();
  } catch {
    // Migration already applied or no rows to update
  }

  // Create sqlite-vec virtual table for schema embeddings.
  // Uses a fixed dimension of 1536 (OpenAI text-embedding-ada-002 / text-embedding-3-small).
  // Other providers may produce different dimensions — the table is recreated on mismatch.
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS schema_vec USING vec0(
        connection_id TEXT,
        table_id TEXT,
        embedding float[1536]
      );
    `);
  } catch (e) {
    console.warn('[MetadataStore] Failed to create schema_vec table:', e instanceof Error ? e.message : e);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_embeddings (
      connection_id TEXT NOT NULL,
      table_id TEXT NOT NULL,
      ddl TEXT NOT NULL,
      hash TEXT NOT NULL,
      PRIMARY KEY (connection_id, table_id)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_schema_embeddings_conn ON schema_embeddings(connection_id);
  `);

  seedDefaultAIProviders();
  migrateLegacyAIConfig();
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Metadata store not initialized');
  return db;
}

export function listProfiles(): ConnectionProfile[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, kind, host, port, database, username, ssl, file_path, color, connection_string, created_at, updated_at
     FROM connection_profiles ORDER BY updated_at DESC`,
    )
    .all() as Record<string, unknown>[];

  return rows.map(rowToProfile);
}

export function getProfile(id: string): ConnectionProfile | null {
  const row = getDb().prepare('SELECT * FROM connection_profiles WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;

  return row ? rowToProfile(row) : null;
}

export function getProfilePassword(id: string): string | undefined {
  const row = getDb().prepare('SELECT password FROM connection_profiles WHERE id = ?').get(id) as
    | { password: string | null }
    | undefined;

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
  color?: string;
  connectionString?: string;
}): ConnectionProfile {
  const id = nanoid();
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO connection_profiles (id, name, kind, host, port, database, username, password, ssl, file_path, color, connection_string, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.color ?? null,
      input.connectionString ?? null,
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
    color?: string;
    connectionString?: string;
  },
): ConnectionProfile | null {
  const existing = getProfile(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const existingPassword = getProfilePassword(id);
  getDb()
    .prepare(
      `UPDATE connection_profiles SET
        name = ?, kind = ?, host = ?, port = ?, database = ?, username = ?, password = ?,
        ssl = ?, file_path = ?, color = ?, connection_string = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.name ?? existing.name,
      input.kind ?? existing.kind,
      input.host ?? existing.host,
      input.port ?? existing.port,
      input.database ?? existing.database,
      input.username ?? existing.username,
      input.password ?? existingPassword,
      input.ssl !== undefined ? (input.ssl ? 1 : 0) : existing.ssl ? 1 : 0,
      input.filePath ?? existing.filePath,
      input.color ?? existing.color,
      input.connectionString ?? existing.connectionString,
      now,
      id,
    );

  return getProfile(id);
}

export function deleteProfile(id: string): boolean {
  const result = getDb().prepare('DELETE FROM connection_profiles WHERE id = ?').run(id);
  return result.changes > 0;
}

function rowToProfile(row: Record<string, unknown>): ConnectionProfile {
  return {
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as ConnectionProfile['kind'],
    host: (row.host as string) ?? undefined,
    port: (row.port as number) ?? undefined,
    database: (row.database as string) ?? undefined,
    username: (row.username as string) ?? undefined,
    ssl: row.ssl === 1,
    filePath: (row.file_path as string) ?? undefined,
    color: (row.color as string) ?? undefined,
    connectionString: (row.connection_string as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function migrateLegacyAIConfig(): void {
  const hasOldTable = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_config'")
    .get() as { name: string } | undefined;
  if (!hasOldTable) return;

  const legacyProvider = getDb().prepare('SELECT value FROM ai_config WHERE key = ?').get('provider') as
    | { value: string }
    | undefined;
  if (!legacyProvider?.value) return;

  const existingActiveProvider = getDb()
    .prepare('SELECT value FROM ai_settings WHERE key = ?')
    .get('activeProvider') as { value: string } | undefined;
  if (existingActiveProvider?.value) return;

  const legacyApiKey = getDb().prepare('SELECT value FROM ai_config WHERE key = ?').get('apiKey') as
    | { value: string }
    | undefined;
  const legacyModel = getDb().prepare('SELECT value FROM ai_config WHERE key = ?').get('model') as
    | { value: string }
    | undefined;
  const legacyBaseUrl = getDb().prepare('SELECT value FROM ai_config WHERE key = ?').get('baseUrl') as
    | { value: string }
    | undefined;

  const settings = createDefaultAISettings();
  const mappedProvider: AIProvider = legacyProvider.value === 'ollama' ? 'ollama-local' : 'openai';
  settings.activeProvider = mappedProvider;
  settings.providers[mappedProvider] = {
    enabled: true,
    model: legacyModel?.value ?? settings.providers[mappedProvider].model,
    baseUrl: legacyBaseUrl?.value ?? settings.providers[mappedProvider].baseUrl ?? '',
    apiKey: legacyApiKey?.value ?? settings.providers[mappedProvider].apiKey ?? '',
  };

  saveAISettings(settings);
}

function seedDefaultAIProviders(): void {
  const upsert = getDb().prepare(`
    INSERT OR IGNORE INTO ai_provider_configs (provider, enabled, model, base_url, api_key)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const [provider, config] of Object.entries(createDefaultAISettings().providers) as [
    AIProvider,
    AIProviderConfig,
  ][]) {
    upsert.run(provider, config.enabled ? 1 : 0, config.model, config.baseUrl ?? '', config.apiKey ?? '');
  }
}

function normalizeAISettings(input: AISettings): AISettings {
  const normalized = createDefaultAISettings();

  for (const provider of Object.keys(normalized.providers) as AIProvider[]) {
    const config = input.providers[provider] ?? normalized.providers[provider];
    normalized.providers[provider] = {
      enabled: Boolean(config.enabled),
      model: config.model?.trim() ?? '',
      baseUrl: config.baseUrl?.trim().replace(/\/+$/, '') ?? '',
      apiKey: config.apiKey?.trim() ?? '',
    };
  }

  normalized.activeProvider = input.activeProvider in normalized.providers ? input.activeProvider : DEFAULT_AI_PROVIDER;

  return normalized;
}

export function getAISettings(): AISettings {
  const cached = aiSettingsCache.get('settings');
  if (cached) return structuredClone(cached);

  const settings = createDefaultAISettings();
  const db = getDb();

  db.transaction(() => {
    const activeProviderRow = db.prepare('SELECT value FROM ai_settings WHERE key = ?').get('activeProvider') as
      | { value: string }
      | undefined;

    if (activeProviderRow?.value && activeProviderRow.value in settings.providers) {
      settings.activeProvider = activeProviderRow.value as AIProvider;
    }

    const rows = db.prepare('SELECT provider, enabled, model, base_url, api_key FROM ai_provider_configs').all() as {
      provider: string;
      enabled: number;
      model: string;
      base_url: string | null;
      api_key: string | null;
    }[];

    for (const row of rows) {
      if (!(row.provider in settings.providers)) continue;
      settings.providers[row.provider as AIProvider] = {
        enabled: row.enabled === 1,
        model: row.model,
        baseUrl: row.base_url ?? '',
        apiKey: row.api_key ?? '',
      };
    }
  })();

  aiSettingsCache.set('settings', settings);
  return structuredClone(settings);
}

export function saveAISettings(settings: AISettings): void {
  const normalized = normalizeAISettings(settings);
  const upsertSetting = getDb().prepare('INSERT OR REPLACE INTO ai_settings (key, value) VALUES (?, ?)');
  const upsertProvider = getDb().prepare(`
    INSERT OR REPLACE INTO ai_provider_configs (provider, enabled, model, base_url, api_key)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = getDb().transaction(() => {
    upsertSetting.run('activeProvider', normalized.activeProvider);
    for (const [provider, config] of Object.entries(normalized.providers) as [AIProvider, AIProviderConfig][]) {
      upsertProvider.run(provider, config.enabled ? 1 : 0, config.model, config.baseUrl ?? '', config.apiKey ?? '');
    }
  });

  tx();
  aiSettingsCache.clear();
}

export function closeMetadataStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Chat message functions
export interface ChatMessage {
  id: string;
  connectionId: string;
  mongoDatabase?: string | null;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export function saveChatMessage(
  connectionId: string,
  role: 'user' | 'assistant',
  content: string,
  mongoDatabase?: string | null,
): ChatMessage {
  const id = nanoid();
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO chat_messages (id, connection_id, mongo_database, role, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, connectionId, mongoDatabase ?? null, role, content, now);

  return { id, connectionId, mongoDatabase, role, content, createdAt: now };
}

export function getChatMessages(connectionId: string, limit = 50, mongoDatabase?: string | null): ChatMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT id, connection_id, mongo_database, role, content, created_at
       FROM chat_messages
       WHERE connection_id = ? AND (mongo_database IS ? OR (mongo_database IS NULL AND ? IS NULL))
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(connectionId, mongoDatabase ?? null, mongoDatabase ?? null, limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row.id as string,
    connectionId: row.connection_id as string,
    mongoDatabase: row.mongo_database as string | null,
    role: row.role as 'user' | 'assistant',
    content: row.content as string,
    createdAt: row.created_at as string,
  }));
}

export function saveQueryHistory(
  connectionId: string,
  input: import('@kamehadb/shared').SaveQueryHistoryInput,
): import('@kamehadb/shared').QueryHistoryEntry {
  const id = nanoid();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO query_history (id, connection_id, query, executed_at, duration_ms, row_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, connectionId, input.query, now, input.durationMs ?? null, input.rowCount ?? null);
  return {
    id,
    connectionId,
    query: input.query,
    executedAt: now,
    durationMs: input.durationMs,
    rowCount: input.rowCount,
    favorite: false,
  };
}

export function getQueryHistory(
  connectionId: string,
  limit = 50,
  favoritesOnly = false,
): import('@kamehadb/shared').QueryHistoryEntry[] {
  if (favoritesOnly) {
    const rows = getDb()
      .prepare(
        `SELECT id, connection_id, query, executed_at, duration_ms, row_count, favorite, name
         FROM query_history
         WHERE connection_id = ? AND favorite = 1
         ORDER BY executed_at DESC
         LIMIT ?`,
      )
      .all(connectionId, limit) as Record<string, unknown>[];
    return rows.map(mapQueryRow);
  }
  const rows = getDb()
    .prepare(
      `SELECT id, connection_id, query, executed_at, duration_ms, row_count, favorite, name
       FROM query_history
       WHERE connection_id = ?
       ORDER BY executed_at DESC
       LIMIT ?`,
    )
    .all(connectionId, limit) as Record<string, unknown>[];
  return rows.map(mapQueryRow);
}

function mapQueryRow(row: Record<string, unknown>): import('@kamehadb/shared').QueryHistoryEntry {
  return {
    id: row.id as string,
    connectionId: row.connection_id as string,
    query: row.query as string,
    executedAt: row.executed_at as string,
    durationMs: row.duration_ms as number | undefined,
    rowCount: row.row_count as number | undefined,
    favorite: row.favorite === 1,
    name: row.name as string | undefined,
  };
}

export function updateQueryHistory(id: string, input: import('@kamehadb/shared').UpdateQueryHistoryInput): void {
  if (input.favorite !== undefined) {
    getDb()
      .prepare('UPDATE query_history SET favorite = ? WHERE id = ?')
      .run(input.favorite ? 1 : 0, id);
  }
  if (input.name !== undefined) {
    getDb().prepare('UPDATE query_history SET name = ? WHERE id = ?').run(input.name, id);
  }
}

export function deleteQueryHistory(id: string): void {
  getDb().prepare('DELETE FROM query_history WHERE id = ?').run(id);
}

export function clearChatMessages(connectionId: string, mongoDatabase?: string | null): void {
  if (mongoDatabase) {
    getDb()
      .prepare('DELETE FROM chat_messages WHERE connection_id = ? AND mongo_database = ?')
      .run(connectionId, mongoDatabase);
  } else {
    getDb().prepare('DELETE FROM chat_messages WHERE connection_id = ? AND mongo_database IS NULL').run(connectionId);
  }
}

export function saveSchemaSnapshot(connectionId: string, snapshotData: string): string {
  const id = nanoid();
  getDb()
    .prepare('INSERT INTO schema_snapshots (id, connection_id, captured_at, snapshot_data) VALUES (?, ?, ?, ?)')
    .run(id, connectionId, new Date().toISOString(), snapshotData);
  return id;
}

export function getSchemaSnapshots(connectionId: string): { id: string; capturedAt: string }[] {
  const rows = getDb()
    .prepare('SELECT id, captured_at FROM schema_snapshots WHERE connection_id = ? ORDER BY captured_at ASC')
    .all(connectionId) as { id: string; captured_at: string }[];
  return rows.map((r) => ({ id: r.id, capturedAt: r.captured_at }));
}

export function getSchemaSnapshotData(id: string): string | null {
  const row = getDb().prepare('SELECT snapshot_data FROM schema_snapshots WHERE id = ?').get(id) as
    | { snapshot_data: string }
    | undefined;
  return row?.snapshot_data ?? null;
}

export function deleteOldSchemaSnapshots(connectionId: string, keep: number): void {
  getDb()
    .prepare(
      `DELETE FROM schema_snapshots WHERE connection_id = ? AND id NOT IN (
        SELECT id FROM schema_snapshots WHERE connection_id = ? ORDER BY captured_at DESC LIMIT ?
      )`,
    )
    .run(connectionId, connectionId, keep);
}
