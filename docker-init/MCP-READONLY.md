# MCP read-only test accounts

These fixtures create dedicated read-only database accounts for verifying the
read-only MCP server. They do not replace or weaken the existing writable
`kameha` user.

| Engine     | File                           | Account         | Auto-run? |
| ---------- | ------------------------------ | --------------- | --------- |
| PostgreSQL | `postgres/02-mcp-readonly.sql` | `kameha_mcp_ro` | Yes       |
| MySQL      | `mysql/02-mcp-readonly.sql`    | `kameha_mcp_ro` | Yes       |
| MariaDB    | `mariadb/02-mcp-readonly.sql`  | `kameha_mcp_ro` | Yes       |
| SQL Server | `sqlserver/mcp-readonly.sql`   | `kameha_mcp_ro` | No        |
| MongoDB    | `mcp-readonly/mongodb.js`      | `kameha_mcp_ro` | No        |

## Important notes

- PostgreSQL, MySQL, and MariaDB entrypoints run the init scripts only on a
  **fresh Docker volume**. If you already have a `*_data` volume, either remove
  it (`docker compose down -v`) or run the SQL manually against the running
  container.
- SQL Server has **no service** in the repo `docker-compose.yml`. Run
  `sqlserver/mcp-readonly.sql` against your own test instance with `sqlcmd`.
- The default MongoDB service runs **without authentication**, so a read-only
  role cannot be enforced. The Mongo helper is kept outside any
  `docker-entrypoint-initdb.d` path and must be run manually against an
  auth-enabled test instance.
- Passwords here are test-only credentials for local Docker databases. Default
  read-only password is `kameha_ro`.

## Verifying the read-only grant

1. Connect with the read-only account directly (not through KamehaDB) and run an
   `INSERT`/`UPDATE`/`DELETE`. The database itself must reject it. This bypasses
   the application-side `isQuerySafe` check and proves the grant is the
   enforcement layer.
2. Enable an MCP profile that uses the read-only account in KamehaDB, then run
   the same read queries through MCP.
