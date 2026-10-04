-- Read-only account for MCP testing. MariaDB runs files in
-- docker-entrypoint-initdb.d in name order on a fresh volume. Writable kameha
-- account is left untouched.
CREATE USER 'kameha_mcp_ro'@'%' IDENTIFIED BY 'kameha_ro';
GRANT SELECT, SHOW VIEW ON kamehadb.* TO 'kameha_mcp_ro'@'%';
FLUSH PRIVILEGES;
