-- Read-only login for MCP testing. PostgreSQL runs every file in
-- docker-entrypoint-initdb.d in name order on a fresh volume, so this applies
-- right after 01-seed.sql. It does not change the writable kameha account.
CREATE USER kameha_mcp_ro WITH PASSWORD 'kameha_ro';
GRANT CONNECT ON DATABASE kamehadb TO kameha_mcp_ro;
GRANT USAGE ON SCHEMA public TO kameha_mcp_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO kameha_mcp_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO kameha_mcp_ro;
