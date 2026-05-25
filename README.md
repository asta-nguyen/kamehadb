# kamehadb

**kamehadb** is a local-first, cross-platform database GUI built with Tauri, React, and Node.js. It connects to PostgreSQL, MySQL, SQLite, and Redis — letting you browse schemas, run queries, and visualize relationships without leaving your desktop.

## Features

- **Multi-engine support** — PostgreSQL, MySQL, SQLite, Redis (MariaDB compatible via MySQL adapter)
- **Schema browser** — browse databases, schemas, tables, columns, and indexes
- **SQL editor** — Monaco-based editor with syntax highlighting, autocomplete, and FK-aware JOIN/ON suggestions
- **ER diagram** — auto-generated graph of tables and foreign key relationships (powered by ReactFlow + dagre)
- **AI assistant** — chat with multiple LLM providers (OpenAI, Ollama, 9Router) to generate and explain SQL
- **Connection URL** — paste `postgresql://`, `mysql://`, or `redis://` URIs to auto-fill connection fields
- **Local-first** — all metadata stored locally via SQLite, credentials encrypted at rest

## Quick Start

```bash
# Install dependencies
pnpm install

# Start dev services (PostgreSQL, MySQL, MariaDB, Redis)
docker compose up -d

# Run the app (sidecar + desktop)
pnpm dev
```

Then open the desktop app, create a new connection pointing at `localhost`, and start exploring.

### Connection defaults (Docker)

| Engine    | Port  | User   | Password | Database  |
|-----------|-------|--------|----------|-----------|
| PostgreSQL | 5432 | kameha | kameha   | kamehadb  |
| MySQL     | 3306 | kameha | kameha   | kamehadb  |
| MariaDB   | 3307 | kameha | kameha   | kamehadb  |
| Redis     | 6379 | —      | —        | —         |

## Project Structure

```
kamehadb/
├── apps/
│   ├── desktop/          # Tauri + React frontend (Vite, Tailwind, shadcn/ui)
│   └── sidecar/          # Node.js backend (Hono, PostgreSQL/MySQL/SQLite adapters)
├── packages/
│   ├── shared/           # Shared types, Zod schemas, SQL adapter interface
│   └── ui/               # Shared UI primitives
├── docker-compose.yml    # Dev databases
└── docker-init/          # Seed SQL scripts for dev databases
```

## Running Tests

```bash
pnpm test
```

## Tech Stack

- **Desktop**: Tauri v2, React 19, Vite, Tailwind CSS, shadcn/ui, tanstack (query, store, table)
- **Editor**: Monaco (via @monaco-editor/react), custom SQL autocomplete with FK-aware JOIN/ON hints
- **Sidecar**: Hono, PostgreSQL (`pg`), MySQL (`mysql2`), SQLite (`better-sqlite3`)
- **Graph**: ReactFlow, dagre auto-layout
- **AI**: Multi-provider abstraction (OpenAI, Ollama, 9Router)

## Roadmap

### Currently Supported
- [x] PostgreSQL
- [x] MySQL
- [x] SQLite

### Not Yet Supported
- [ ] Redis
- [ ] MongoDB
- [ ] SQL Server
- [ ] Oracle
- [ ] ClickHouse

### Future Ideas
- [ ] Data export (CSV, JSON, SQL)
- [ ] Query history with favorites
- [ ] Migration assistant
- [ ] Data visualization / charts
- [ ] Collaboration features

## License

MIT — see [LICENSE](./LICENSE).
