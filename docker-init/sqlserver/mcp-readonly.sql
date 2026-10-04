-- Read-only login for MCP testing. There is no SQL Server service in the repo
-- docker-compose file, so run this manually against a test instance:
--   sqlcmd -S localhost,1433 -U sa -P '<password>' -i docker-init/sqlserver/mcp-readonly.sql
-- The writable sa login is left untouched.
CREATE LOGIN kameha_mcp_ro WITH PASSWORD = 'Kameha_ro1!';
GO
USE kamehadb;
GO
CREATE USER kameha_mcp_ro FOR LOGIN kameha_mcp_ro;
GO
ALTER ROLE db_datareader ADD MEMBER kameha_mcp_ro;
GO
