---
mapped_at: 2026-06-27
last_mapped_commit:pending
focus: tech
---

# External Integrations

## Overview

KamehaDB integrates with 12 database engines through dedicated adapters in the sidecar. The desktop app communicates with the sidecar over HTTP (localhost:3170). Tauri native commands handle OS-level operations (psql, backup/restore, logs, PTY).

## Database Engine Adapters

### SQL Adapters (via `/sql` routes)

| Engine     | Driver               | Package   | Key File                         |
| ---------- | -------------------- | --------- | -------------------------------- |
| PostgreSQL | `pg`                 | ^8        | `apps/sidecar/src/routes/sql.ts` |
| MySQL      | `mysql2`             | ^3.22.3   | `apps/sidecar/src/routes/sql.ts` |
| MariaDB    | `mysql2`             | ^3.22.3   | `apps/sidecar/src/routes/sql.ts` |
| SQLite     | `better-sqlite3`     | ^11       | `apps/sidecar/src/routes/sql.ts` |
| SQL Server | `mssql`              | ^12.5.5   | `apps/sidecar/src/routes/sql.ts` |
| Oracle     | `oracledb`           | ^7.0.0    | `apps/sidecar/src/routes/sql.ts` |
| ClickHouse | `@clickhouse/client` | ^1.20.0   | `apps/sidecar/src/routes/sql.ts` |
| DuckDB     | `@duckdb/node-api`   | 1.5.4-r.1 | `apps/sidecar/src/routes/sql.ts` |

### NoSQL/Dedicated Adapters

| Engine      | Driver                   | Package | Route File                               |
| ----------- | ------------------------ | ------- | ---------------------------------------- |
| MongoDB     | `mongodb`                | ^7.2.0  | `apps/sidecar/src/routes/mongo.ts`       |
| Redis       | `ioredis`                | ^5.4.2  | `apps/sidecar/src/routes/redis.ts`       |
| Qdrant      | `@qdrant/js-client-rest` | ^1.18.0 | `apps/sidecar/src/routes/qdrant.ts`      |
| TigerBeetle | `tigerbeetle-node`       | 0.17.4  | `apps/sidecar/src/routes/tigerbeetle.ts` |

## Internal Service Communication

### Desktop ↔ Sidecar

- **Protocol:** HTTP (JSON)
- **Base URL:** `http://127.0.0.1:3170` (configurable)
- **Client:** `apps/desktop/src/lib/api.ts` → `apps/desktop/src/lib/api-client.ts`
- **Proxy:** Vite dev server proxies `/api` → `http://127.0.0.1:3170` (see `apps/desktop/vite.config.ts`)
- **CORS:** Sidecar allows all origins (`cors({ origin: '*' })`)
- **Port discovery:** Sidecar prints `KAMEHADB_SIDECAR_PORT=<port>` to stdout for Tauri to parse

### Sidecar Route Groups

| Route            | Purpose                                                             | File                                       |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| `/health`        | Health check                                                        | `apps/sidecar/src/index.ts`                |
| `/connections`   | CRUD connection profiles, health checks, file DB backup/restore     | `apps/sidecar/src/routes/connections.ts`   |
| `/sql`           | SQL metadata, query execution, preview rows, autocomplete, PG stats | `apps/sidecar/src/routes/sql.ts`           |
| `/query-history` | Saved SQL history and favorites                                     | `apps/sidecar/src/routes/query-history.ts` |
| `/mongo`         | MongoDB databases, collections, documents, stats, update/delete     | `apps/sidecar/src/routes/mongo.ts`         |
| `/redis`         | Key scanning, value lookup, TTL, connection testing                 | `apps/sidecar/src/routes/redis.ts`         |
| `/qdrant`        | Collections, points, similarity search, recommend, stats            | `apps/sidecar/src/routes/qdrant.ts`        |
| `/tigerbeetle`   | Accounts, balances, transfers                                       | `apps/sidecar/src/routes/tigerbeetle.ts`   |
| `/ai`            | AI provider settings, chat, schema cache, chat history              | `apps/sidecar/src/routes/ai.ts`            |

### Tauri Native Commands (Rust ↔ Frontend)

| Command            | Purpose                                 | File                                     |
| ------------------ | --------------------------------------- | ---------------------------------------- |
| `read_app_logs`    | Read merged frontend/tauri/sidecar logs | `apps/desktop/src-tauri/src/app_logs.rs` |
| `append_tauri_log` | Write Tauri-side log entries            | `apps/desktop/src-tauri/src/app_logs.rs` |
| psql commands      | Embedded PostgreSQL shell               | `apps/desktop/src-tauri/src/`            |
| backup/restore     | PostgreSQL backup/restore jobs          | `apps/desktop/src-tauri/src/`            |

## Metadata Storage

- **Engine:** SQLite via `better-sqlite3`
- **Store:** `apps/sidecar/src/db/metadata-store.ts`
- **Default path:** `./kamehadb.db` (dev) or `${KAMEHADB_DATA_DIR}/kamehadb.db` (production)
- **Stores:** Connection profiles, AI settings, chat history, query history

## AI Integration

- **Route:** `/ai` in `apps/sidecar/src/routes/ai.ts`
- **Provider abstraction:** `apps/sidecar/src/ai/` directory
- **Schema context:** `apps/sidecar/src/ai/indexer.ts` — proactive schema indexing for all SQL connections
- **Chat history:** Persisted in metadata SQLite store
- **Schema cache:** `apps/sidecar/src/lib/cache.ts` caches schema/metadata results

## External Shell Integration

### MongoDB Shell (`mongosh`)

- **Resolver:** `apps/sidecar/src/lib/mongosh.ts`
- **Behavior:** Resolves local `mongosh` binary, or installs app-managed copy under app data directory
- **No global modification:** Does not modify user's global installation

### PostgreSQL `psql`

- **Managed by:** Tauri native commands in `apps/desktop/src-tauri/src/`
- **Used for:** Embedded psql shell, backup/restore workflows

## Docker Dev Databases (`docker-compose.yml`)

| Service     | Image                                    | Port       |
| ----------- | ---------------------------------------- | ---------- |
| PostgreSQL  | `pgvector/pgvector:0.8.0-pg17`           | 5432       |
| MySQL       | `mysql:8.4`                              | 3306       |
| MariaDB     | `mariadb:11.4`                           | 3307       |
| Redis       | `redis:7-alpine`                         | 6379       |
| DuckDB      | `duckdb/duckdb:latest`                   | 5433       |
| TigerBeetle | `ghcr.io/tigerbeetle/tigerbeetle:latest` | 3001       |
| MongoDB     | `mongo:7`                                | 27017      |
| Qdrant      | `qdrant/qdrant:v1.13.6`                  | 6333, 6334 |

## Logging Pipeline

| Source          | Writer                                       | Destination                                      |
| --------------- | -------------------------------------------- | ------------------------------------------------ |
| Frontend errors | `apps/desktop/src/lib/app-logs.ts` → Tauri   | `${app_data_dir}/logs/frontend.log`              |
| Tauri (Rust)    | `append_tauri_log()` in `app_logs.rs`        | `${app_data_dir}/logs/tauri.log`                 |
| Sidecar (pino)  | `apps/sidecar/src/lib/logger.ts` multistream | stdout + `${KAMEHADB_DATA_DIR}/logs/sidecar.log` |
| Combined view   | `read_app_logs` Tauri command                | In-app Logs page                                 |

## Keyring Integration

- **Crate:** `keyring` v3 in Tauri Rust
- **Purpose:** Secure credential storage for database connection passwords
- **Platform:** macOS Keychain, Windows Credential Manager, Linux Secret Service

## Caching

- **Library:** `lru-cache` ^11.5.0
- **Implementation:** `apps/sidecar/src/lib/cache.ts`
- **Cached content:** Schema metadata, query results, autocomplete data
