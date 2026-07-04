#!/bin/bash
# Wait for SQL Server to start, then run init scripts.
/opt/mssql/bin/mssql-server &

# Wait for the server to be ready
echo "Waiting for SQL Server to start..."
for i in $(seq 1 60); do
  if /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "SELECT 1" > /dev/null 2>&1; then
    echo "SQL Server is ready."
    break
  fi
  sleep 1
done

# Create the database if it doesn't exist
/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = 'kamehadb') CREATE DATABASE kamehadb" 2>&1

# Run init scripts in order
for f in /docker-init/sqlserver/*.sql; do
  if [ -f "$f" ]; then
    echo "Running $f..."
    /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -d kamehadb -i "$f" 2>&1
  fi
done

echo "Init complete."

# Wait for the SQL Server process to exit
wait
