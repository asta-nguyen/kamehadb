# KamehaDB MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that exposes KamehaDB's saved connections to AI coding assistants (Claude Code, Codex CLI, OpenCode, etc.).

The MCP server is a thin **stdio** process that translates `tools/call` into HTTP requests against a running KamehaDB sidecar. All safety checks, caching, and database adapter logic stay in the sidecar — this server adds no DB access of its own.

## Prerequisites

1. KamehaDB sidecar running on `127.0.0.1:3170` (default port).
   ```bash
   pnpm dev:sidecar
   ```
2. At least one saved connection in KamehaDB (open the desktop app and add one if you haven't).
3. Node.js 22+.

## Build

From the repo root:

```bash
pnpm install
pnpm --filter @kamehadb/mcp-server build
```

Or run in dev mode (auto-reload):

```bash
pnpm --filter @kamehadb/mcp-server dev
```

## Configure your MCP client

### Claude Code

Edit `~/.claude/mcp.json` (or `.mcp.json` in the project root):

```json
{
  "mcpServers": {
    "kamehadb": {
      "command": "pnpm",
      "args": ["--filter", "@kamehadb/mcp-server", "start"],
      "env": { "KAMEHADB_SIDECAR_URL": "http://127.0.0.1:3170" }
    }
  }
}
```

Restart Claude Code. You should see `kamehadb` listed with 8 tools.

### Codex CLI

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.kamehadb]
command = "pnpm"
args = ["--filter", "@kamehadb/mcp-server", "start"]
[mcp_servers.kamehadb.env]
KAMEHADB_SIDECAR_URL = "http://127.0.0.1:3170"
```

### OpenCode

Edit `~/.config/opencode/config.json`:

```json
{
  "mcp": {
    "kamehadb": {
      "command": "pnpm",
      "args": ["--filter", "@kamehadb/mcp-server", "start"],
      "env": { "KAMEHADB_SIDECAR_URL": "http://127.0.0.1:3170" }
    }
  }
}
```

## Tools

| Tool                   | What it does                                           |
| ---------------------- | ------------------------------------------------------ |
| `list_connections`     | List saved KamehaDB connections.                       |
| `get_schema_summary`   | Condensed tables + columns for a SQL connection.       |
| `describe_table`       | Columns, types, PK/FK, and indexes for a single table. |
| `search_schema`        | Substring search across table and column names.        |
| `run_readonly_query`   | Execute a SELECT/CTE/SHOW on a SQL connection.         |
| `explain_query`        | Run EXPLAIN on a SELECT to see the query plan.         |
| `scan_redis_keys`      | Scan keys in a Redis connection (SCAN, not KEYS).      |
| `find_mongo_documents` | Find documents in a MongoDB collection.                |

## Why doesn't this mutate my data?

The sidecar enforces read-only by default on every connection (`readonly: true` on the profile). When the MCP tool calls the sidecar's `/sql/:id/query` or `/redis/:id/command` endpoints, the sidecar rejects any statement in the destructive list (`DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `GRANT`, `REVOKE`). A 403 with `error: 'FORBIDDEN'` is surfaced back to the model as an `isError: true` result.

## Troubleshooting

- **"KamehaDB sidecar not running"** — start the sidecar with `pnpm dev:sidecar` before invoking any tool.
- **Empty `list_connections`** — add a connection in the KamehaDB desktop app first.
- **Read-only rejection** — the connection profile has `readonly: true` (the default). Edit the profile in the desktop app to flip it off if you really need write access from the MCP server.
