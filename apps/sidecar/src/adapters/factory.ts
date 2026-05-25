import type { ConnectionProfile, SqlAdapter } from "@kamehadb/shared";
import { createPostgresAdapter } from "./postgres.js";
import { createSqliteAdapter } from "./sqlite.js";
import { createMysqlAdapter } from "./mysql.js";

export function createAdapter(profile: ConnectionProfile, _password?: string): SqlAdapter {
  switch (profile.kind) {
    case "postgres":
      return createPostgresAdapter({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: profile.username,
        password: _password,
        ssl: profile.ssl,
      });
    case "mysql":
      return createMysqlAdapter({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: profile.username,
        password: _password,
      });
    case "sqlite":
      if (!profile.filePath) throw new Error("SQLite file path is required");
      return createSqliteAdapter(profile.filePath);
    default:
      throw new Error(`Unsupported database kind: ${profile.kind}`);
  }
}
