---
mapped_at: 2026-06-27
last_mapped_commit:pending
focus: tech
---

# Technology Stack

## Overview

KamehaDB is a local-first database GUI built as a Tauri v2 desktop app with a Node.js sidecar backend. The project uses a pnpm monorepo structure for the desktop app and sidecar, with a separate npm-managed Next.js marketing site.

## Languages & Runtimes

| Language   | Runtime        | Version        | Location                            |
| ---------- | -------------- | -------------- | ----------------------------------- |
| TypeScript | Node.js        | v22 (`.nvmrc`) | `apps/sidecar/`, `packages/shared/` |
| TypeScript | Browser (Vite) | ES2020 target  | `apps/desktop/src/`                 |
| Rust       | Native (Tauri) | Edition 2021   | `apps/desktop/src-tauri/`           |
| TypeScript | Next.js 16     | Node 20+       | `landing/`                          |

## Monorepo Structure

- **Package manager:** pnpm with workspaces (`pnpm-workspace.yaml`)
- **Workspace packages:** `apps/*`, `packages/*`
- **Landing site:** Separate npm project (not in pnpm workspace)
- **Root scripts:** `pnpm dev` (sidecar + desktop), `pnpm build` (sidecar → desktop), `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Key Dependencies

### Sidecar (`apps/sidecar/package.json`)

| Category          | Package                     | Version   |
| ----------------- | --------------------------- | --------- |
| HTTP framework    | `hono`                      | ^4        |
| HTTP server       | `@hono/node-server`         | ^1        |
| Validation        | `hono/zod-validator`, `zod` | ^0.4, ^3  |
| Logging           | `pino`, `pino-pretty`       | ^9, ^13   |
| PostgreSQL        | `pg`                        | ^8        |
| MySQL             | `mysql2`                    | ^3.22.3   |
| SQL Server        | `mssql`                     | ^12.5.5   |
| Oracle            | `oracledb`                  | ^7.0.0    |
| ClickHouse        | `@clickhouse/client`        | ^1.20.0   |
| DuckDB            | `@duckdb/node-api`          | 1.5.4-r.1 |
| MongoDB           | `mongodb`                   | ^7.2.0    |
| Redis             | `ioredis`                   | ^5.4.2    |
| Qdrant            | `@qdrant/js-client-rest`    | ^1.18.0   |
| TigerBeetle       | `tigerbeetle-node`          | 0.17.4    |
| SQLite (metadata) | `better-sqlite3`            | ^11       |
| SQLite vector     | `sqlite-vec`                | ^0.1.9    |
| Terminal          | `node-pty`                  | ^1.1.0    |
| Caching           | `lru-cache`                 | ^11.5.0   |
| IDs               | `nanoid`                    | ^5        |

### Desktop (`apps/desktop/package.json`)

| Category         | Package                                                  | Version              |
| ---------------- | -------------------------------------------------------- | -------------------- |
| UI framework     | `react`, `react-dom`                                     | ^19.1.0              |
| Build tool       | `vite`                                                   | ^7.0.4               |
| Desktop runtime  | `@tauri-apps/api`                                        | ^2                   |
| Tauri plugins    | `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-opener` | ^2                   |
| State management | `@tanstack/react-store`, `@tanstack/store`               | ^0.7                 |
| Data fetching    | `@tanstack/react-query`                                  | ^5                   |
| Tables           | `@tanstack/react-table`                                  | ^8                   |
| Pacing           | `@tanstack/pacer`                                        | ^0.21.1              |
| Code editor      | `@monaco-editor/react`, `monaco-editor`                  | ^4.7.0, ^0.52.2      |
| Terminal         | `@xterm/xterm`, `@xterm/addon-fit`                       | ^6.0.0, ^0.11.0      |
| Flow diagrams    | `@xyflow/react`, `dagre`                                 | ^12.10.2, ^0.8.5     |
| 3D               | `three`                                                  | ^0.184.0             |
| Charts           | `recharts`                                               | ^3.8.1               |
| Styling          | `tailwindcss` (v4), `@tailwindcss/vite`                  | ^4                   |
| UI components    | `shadcn`, `shadcn-ui`, `@base-ui/react`                  | ^4.8.0, ^0.9, ^1.5.0 |
| Icons            | `lucide-react`, `developer-icons`                        | ^0.400.0, ^7.0.1     |
| Markdown         | `react-markdown`, `remark-gfm`                           | ^10.1.0, ^4.0.1      |
| Syntax highlight | `highlight.js`                                           | ^11.11.1             |
| Forms            | `react-hook-form`, `@hookform/resolvers`                 | ^7, ^5               |
| Theming          | `next-themes`                                            | ^0.4.6               |
| Toasts           | `sonner`                                                 | ^2.0.7               |
| Command palette  | `cmdk`                                                   | ^1.1.1               |
| Validation       | `zod`                                                    | ^3                   |
| Testing          | `vitest`                                                 | ^4.1.7               |

### Shared (`packages/shared/package.json`)

| Category   | Package | Version |
| ---------- | ------- | ------- |
| Validation | `zod`   | ^3      |

### Tauri Rust (`apps/desktop/src-tauri/Cargo.toml`)

| Category       | Crate                                                              | Version           |
| -------------- | ------------------------------------------------------------------ | ----------------- |
| App framework  | `tauri`                                                            | 2                 |
| Tauri plugins  | `tauri-plugin-dialog`, `tauri-plugin-opener`, `tauri-plugin-shell` | 2                 |
| Serialization  | `serde`, `serde_json`                                              | 1                 |
| Async runtime  | `tokio`                                                            | 1 (full features) |
| SQLite         | `rusqlite`                                                         | 0.32 (bundled)    |
| Keyring        | `keyring`                                                          | 3                 |
| PTY            | `portable-pty`                                                     | 0.9.0             |
| Error handling | `anyhow`, `thiserror`                                              | 1, 2              |
| UUIDs          | `uuid`                                                             | 1 (v4)            |
| Temp files     | `tempfile`                                                         | 3                 |

### Landing (`landing/package.json`)

| Category  | Package                                         | Version                   |
| --------- | ----------------------------------------------- | ------------------------- |
| Framework | `next`                                          | 16.2.6                    |
| React     | `react`, `react-dom`                            | 19.2.4                    |
| Styling   | `tailwindcss` (v4), `@tailwindcss/postcss`      | ^4                        |
| Animation | `motion`                                        | ^12.40.0                  |
| Icons     | `@tabler/icons-react`, `lucide-react`, `thesvg` | ^3.44.0, ^1.17.0, ^3.0.15 |
| Testing   | `playwright`                                    | ^1.60.0                   |

## Configuration Files

| File                                     | Purpose                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `.nvmrc`                                 | Node.js version pinning (v22)                                                               |
| `pnpm-workspace.yaml`                    | Workspace package definitions + build allowlist                                             |
| `apps/desktop/vite.config.ts`            | Vite config with React, Tailwind, path alias `@/`, proxy to sidecar                         |
| `apps/desktop/tsconfig.json`             | Strict TS config, ES2020, bundler resolution, `@/*` path alias                              |
| `apps/desktop/src-tauri/tauri.conf.json` | Tauri v2 config (productName: KamehaDB, port 1420)                                          |
| `apps/sidecar/eslint.config.mjs`         | ESLint with custom `local/no-restricted-syntax` (no console.log)                            |
| `.prettierrc`                            | Prettier formatting config                                                                  |
| `commitlint.config.cjs`                  | Conventional commit enforcement                                                             |
| `.husky/`                                | Git hooks (pre-commit, commit-msg, pre-push)                                                |
| `docker-compose.yml`                     | Local dev databases (Postgres, MySQL, MariaDB, Redis, MongoDB, Qdrant, DuckDB, TigerBeetle) |

## Dev Tooling

- **Formatting:** Prettier ^3.8.3
- **Linting:** ESLint ^9 (per-package configs)
- **Git hooks:** Husky ^9.1.7 with lint-staged ^17.0.5
- **Commit convention:** commitlint with conventional commits (@commitlint/config-conventional ^21)
- **Type checking:** TypeScript ~5.8.3 across all packages
- **Testing:** Vitest (desktop), Playwright (landing)
- **Concurrent dev:** `concurrently` ^9 for running sidecar + desktop together

## Build Pipeline

1. `pnpm --filter @kamehadb/sidecar build` (tsc)
2. `pnpm --filter @kamehadb/desktop build` (tsc + vite build)
3. `pnpm --filter @kamehadb/desktop tauri build` (Rust + bundle)

## CI Pipeline (`.github/workflows/ci.yml`)

- **test job:** pnpm install → typecheck → lint → desktop tests
- **build-check job:** pnpm install → build → tauri build (with Rust cache, Tauri system deps)

## Native Build Dependencies (Tauri)

- libgtk-3-dev, libwebkit2gtk-4.1-dev, libappindicator3-dev, librsvg2-dev, patchelf (Linux CI)
