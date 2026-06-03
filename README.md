# KamehaDB

<p align="center">
  <a href="https://kamehadb.astalife.co">
    <img src="apps/desktop/public/logo.png" width="100px" alt="KamehaDB logo" />
  </a>
</p>

**KamehaDB** is a local-first, cross-platform database GUI with built-in AI that connects to PostgreSQL, MySQL, SQLite, MongoDB, and Redis — letting you browse schemas, run queries, and generate SQL through conversation.

## Features

- **AI-SQL Generation** — Chat with AI to generate, explain, and debug SQL queries. Supports OpenAI, Ollama (local & cloud), and 9Router. AI has access to your schema context for accurate query generation.
- **Schema-Aware Context** — AI automatically knows your table structure, columns, types, and foreign key relationships when generating queries.
- **Multi-engine support** — PostgreSQL, MySQL, SQLite, MongoDB, Redis
- **Schema browser** — Browse databases, schemas, tables, columns, and indexes
- **SQL editor** — Monaco-based editor with syntax highlighting, autocomplete, and FK-aware JOIN/ON suggestions
- **ER diagram** — Auto-generated graph of tables and foreign key relationships (powered by ReactFlow + dagre)
- **Connection URL** — paste `postgresql://`, `mysql://`, or `redis://` URIs to auto-fill connection fields
- **Local-first** — All metadata stored locally in a SQLite database; nothing leaves your machine

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
| Ollama (cloud) | —             | Requires base URL and API key            |
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
│   ├── desktop/          # Tauri v2 + React 19 frontend (Vite, Tailwind v4)
│   └── sidecar/          # Hono HTTP server + database adapters + metadata SQLite
├── packages/
│   ├── shared/           # Shared Zod schemas, app state types, adapter contracts
│   └── ui/               # Shared UI primitives
├── landing/              # Next.js marketing & docs site (managed with npm, separate lockfile)
├── docker-compose.yml    # Dev databases
└── docker-init/          # Seed SQL scripts for dev databases
```

## Running Tests

```bash
pnpm test
```

## macOS Gatekeeper

Unsigned macOS builds can still be used for local testing, but Gatekeeper may show messages such as `"KamehaDB" is damaged and can't be opened` or `"KamehaDB" cannot be opened because Apple cannot check it for malicious software`.

If you only need to test the app on your own Mac, try one of these:

1. Right-click `KamehaDB.app`, choose `Open`, then confirm.
2. Remove the quarantine attribute after copying the app to `Applications`:

```bash
xattr -dr com.apple.quarantine /Applications/KamehaDB.app
```

If the app is still being run directly from the mounted DMG:

```bash
xattr -dr com.apple.quarantine "/Volumes/KamehaDB/KamehaDB.app"
```

You can also disable Gatekeeper globally with `sudo spctl --master-disable`, but that is broader than necessary and should not be left enabled long-term.

### Build for Local Machine

If you see "Target does not exist" error, add the required Rust targets first:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

Then build for your local machine:

```bash
# Apple Silicon (M1/M2/M3)
cd apps/desktop && pnpm tauri build --target aarch64-apple-darwin

# Intel Mac
cd apps/desktop && pnpm tauri build --target x86_64-apple-darwin
```

### Linux

```bash
# Build for Linux
cd apps/desktop && pnpm tauri build --target x86_64-unknown-linux-gnu
```

### Windows

```bash
# Build for Windows
cd apps/desktop && pnpm tauri build --target x86_64-pc-windows-msvc
```

## Tech Stack

- **Desktop**: Tauri v2, React 19, Vite, Tailwind CSS v4, Base UI (`@base-ui/react`), TanStack (Query, Store, Table)
- **Editor**: Monaco (via `@monaco-editor/react`), custom SQL autocomplete with FK-aware JOIN/ON hints, markdown rendering with `react-markdown`
- **Sidecar**: Hono, PostgreSQL (`pg`), MySQL (`mysql2`), SQLite (`better-sqlite3`), MongoDB (`mongodb`), Redis (`ioredis`)
- **Graph**: ReactFlow (`@xyflow/react`), dagre auto-layout
- **AI**: Multi-provider abstraction (OpenAI, Ollama local/cloud, 9Router)

## Roadmap

### Currently Supported

- [x] PostgreSQL
- [x] MySQL
- [x] SQLite
- [x] MongoDB
- [x] Redis
- [x] Data export (CSV, JSON, SQL)

### Not Yet Supported

- [ ] SQL Server
- [ ] Oracle
- [ ] ClickHouse

### Future Ideas

- [ ] Query history with favorites
- [ ] Migration assistant
- [ ] Data visualization / charts
- [ ] Collaboration features

## License

MIT — see [LICENSE](./LICENSE).
