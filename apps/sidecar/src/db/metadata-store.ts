import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import type { ConnectionProfile, AIProvider, AISettings, AIProviderConfig } from "@kamehadb/shared";

let db: Database.Database | null = null;
const DEFAULT_AI_PROVIDER = "openai" satisfies AIProvider;

function createDefaultAISettings(): AISettings {
  return {
    activeProvider: DEFAULT_AI_PROVIDER,
    providers: {
      "ollama-local": {
        enabled: false,
        model: "llama3.1",
        baseUrl: "http://localhost:11434/v1",
        apiKey: "",
      },
      "ollama-cloud": {
        enabled: false,
        model: "",
        baseUrl: "",
        apiKey: "",
      },
      openai: {
        enabled: false,
        model: "gpt-4o",
        baseUrl: "",
        apiKey: "",
      },
      "9router": {
        enabled: false,
        model: "",
        baseUrl: "",
        apiKey: "",
      },
    },
  };
}

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

  // Migrate ai_settings from old single-column schema if needed
  const hasOldSettings = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_settings'"
  ).get() as { name: string } | undefined;
  if (hasOldSettings) {
    const colInfo = db.prepare("PRAGMA table_info(ai_settings)").all() as { name: string }[];
    const hasKeyCol = colInfo.some((c) => c.name === "key");
    if (!hasKeyCol) {
      db.exec("DROP TABLE ai_settings; DROP TABLE IF EXISTS ai_provider_configs;");
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

  seedDefaultAIProviders();
  migrateLegacyAIConfig();
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

function migrateLegacyAIConfig(): void {
  const hasOldTable = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_config'")
    .get() as { name: string } | undefined;
  if (!hasOldTable) return;

  const legacyProvider = getDb()
    .prepare("SELECT value FROM ai_config WHERE key = ?")
    .get("provider") as { value: string } | undefined;
  if (!legacyProvider?.value) return;

  const existingActiveProvider = getDb()
    .prepare("SELECT value FROM ai_settings WHERE key = ?")
    .get("activeProvider") as { value: string } | undefined;
  if (existingActiveProvider?.value) return;

  const legacyApiKey = getDb()
    .prepare("SELECT value FROM ai_config WHERE key = ?")
    .get("apiKey") as { value: string } | undefined;
  const legacyModel = getDb()
    .prepare("SELECT value FROM ai_config WHERE key = ?")
    .get("model") as { value: string } | undefined;
  const legacyBaseUrl = getDb()
    .prepare("SELECT value FROM ai_config WHERE key = ?")
    .get("baseUrl") as { value: string } | undefined;

  const settings = createDefaultAISettings();
  const mappedProvider: AIProvider = legacyProvider.value === "ollama" ? "ollama-local" : "openai";
  settings.activeProvider = mappedProvider;
  settings.providers[mappedProvider] = {
    enabled: true,
    model: legacyModel?.value ?? settings.providers[mappedProvider].model,
    baseUrl: legacyBaseUrl?.value ?? settings.providers[mappedProvider].baseUrl ?? "",
    apiKey: legacyApiKey?.value ?? settings.providers[mappedProvider].apiKey ?? "",
  };

  saveAISettings(settings);
}

function seedDefaultAIProviders(): void {
  const upsert = getDb().prepare(`
    INSERT OR IGNORE INTO ai_provider_configs (provider, enabled, model, base_url, api_key)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const [provider, config] of Object.entries(createDefaultAISettings().providers) as [AIProvider, AIProviderConfig][]) {
    upsert.run(
      provider,
      config.enabled ? 1 : 0,
      config.model,
      config.baseUrl ?? "",
      config.apiKey ?? "",
    );
  }
}

function normalizeAISettings(input: AISettings): AISettings {
  const normalized = createDefaultAISettings();

  for (const provider of Object.keys(normalized.providers) as AIProvider[]) {
    const config = input.providers[provider] ?? normalized.providers[provider];
    normalized.providers[provider] = {
      enabled: Boolean(config.enabled),
      model: config.model?.trim() ?? "",
      baseUrl: config.baseUrl?.trim().replace(/\/+$/, "") ?? "",
      apiKey: config.apiKey?.trim() ?? "",
    };
  }

  normalized.activeProvider = input.activeProvider in normalized.providers
    ? input.activeProvider
    : DEFAULT_AI_PROVIDER;

  return normalized;
}

export function getAISettings(): AISettings {
  const settings = createDefaultAISettings();
  const activeProviderRow = getDb()
    .prepare("SELECT value FROM ai_settings WHERE key = ?")
    .get("activeProvider") as { value: string } | undefined;

  if (activeProviderRow?.value && activeProviderRow.value in settings.providers) {
    settings.activeProvider = activeProviderRow.value as AIProvider;
  }

  const rows = getDb()
    .prepare("SELECT provider, enabled, model, base_url, api_key FROM ai_provider_configs")
    .all() as {
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
      baseUrl: row.base_url ?? "",
      apiKey: row.api_key ?? "",
    };
  }

  return settings;
}

export function saveAISettings(settings: AISettings): void {
  const normalized = normalizeAISettings(settings);
  const upsertSetting = getDb().prepare("INSERT OR REPLACE INTO ai_settings (key, value) VALUES (?, ?)");
  const upsertProvider = getDb().prepare(`
    INSERT OR REPLACE INTO ai_provider_configs (provider, enabled, model, base_url, api_key)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = getDb().transaction(() => {
    upsertSetting.run("activeProvider", normalized.activeProvider);
    for (const [provider, config] of Object.entries(normalized.providers) as [AIProvider, AIProviderConfig][]) {
      upsertProvider.run(
        provider,
        config.enabled ? 1 : 0,
        config.model,
        config.baseUrl ?? "",
        config.apiKey ?? "",
      );
    }
  });

  tx();
}

export function closeMetadataStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}
