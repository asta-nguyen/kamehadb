# KamehaDB

<img src="apps/desktop/public/logo.png" alt="KamehaDB" width="300" />

**KamehaDB** is a local-first, cross-platform database GUI with built-in AI that connects to PostgreSQL, MySQL, SQLite, MongoDB, and Redis — letting you browse schemas, run queries, and generate SQL through conversation.

## Features

- **AI-SQL Generation** — Chat with AI to generate, explain, and debug SQL queries. Supports OpenAI, Ollama (local/cloud), and 9Router. AI has access to your schema context for accurate query generation.
- **Schema-Aware Context** — AI automatically knows your table structure, columns, types, and foreign key relationships when generating queries.
- **Multi-engine support** — PostgreSQL, MySQL, SQLite, Redis, MongoDB
- **Schema browser** — Browse databases, schemas, tables, columns, and indexes
- **SQL editor** — Monaco-based editor with syntax highlighting, autocomplete, and FK-aware JOIN/ON suggestions
- **ER diagram** — Auto-generated graph of tables and foreign key relationships (powered by ReactFlow + dagre)
- **Connection URL** — paste `postgresql://`, `mysql://`, or `redis://` URIs to auto-fill connection fields
- **Local-first** — All metadata stored locally via SQLite, credentials encrypted at rest

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

### AI Setup

Configure AI providers in the app settings (API Settings page):

| Provider       | Default Model | Notes                                    |
| -------------- | ------------- | ---------------------------------------- |
| Ollama (local) | `llama3.2`    | Uses `http://localhost:11434` by default |
| OpenAI         | `gpt-4o`      | Requires API key                         |
| 9Router        | Any model     | Requires base URL and API key            |

### Connection defaults (Docker)

| Engine     | Port | User   | Password | Database |
| ---------- | ---- | ------ | -------- | -------- |
| PostgreSQL | 5432 | kameha | kameha   | kamehadb |
| MySQL      | 3306 | kameha | kameha   | kamehadb |
| MariaDB    | 3307 | kameha | kameha   | kamehadb |
| Redis      | 6379 | —      | —        | —        |

## Project Structure

```
kamehadb/
├── apps/
│   ├── desktop/          # Tauri + React frontend (Vite, Tailwind, shadcn/ui)
│   └── sidecar/          # Node.js backend (Hono, database adapters)
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
- **AI**: Multi-provider abstraction (OpenAI, Ollama, 9Router), schema-aware prompt context

## License

MIT — see [LICENSE](./LICENSE).
