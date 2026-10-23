package schema

import (
	"fmt"
	"strings"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// Dialects from shared DIALECT / DIALECT_BY_KIND.
const (
	DialectPostgres   = "postgresql"
	DialectMySQL      = "mysql"
	DialectSQLite     = "sqlite"
	DialectSQLServer  = "sqlserver"
	DialectOracle     = "oracle"
	DialectClickHouse = "clickhouse"
	DialectDuckDB     = "duckdb"
	defaultDialect    = DialectPostgres
)

// ResolveDialect ports resolveDialect — non-SQL kinds default to postgresql.
func ResolveDialect(kind string) string {
	switch kind {
	case engines.KindPostgres:
		return DialectPostgres
	case engines.KindMySQL, engines.KindMariaDB:
		return DialectMySQL
	case engines.KindSQLite:
		return DialectSQLite
	case engines.KindSQLServer:
		return DialectSQLServer
	case engines.KindOracle:
		return DialectOracle
	case engines.KindClickHouse:
		return DialectClickHouse
	case engines.KindDuckDB:
		return DialectDuckDB
	default:
		return defaultDialect
	}
}

// quoteSqlIdentifier from schema-tools.ts — always ANSI double quotes.
func quoteIdent(id string) string {
	return `"` + strings.ReplaceAll(id, `"`, `""`) + `"`
}

func quoteTableID(tableID string) string {
	var parts []string
	for _, p := range strings.Split(tableID, ".") {
		if p != "" {
			parts = append(parts, quoteIdent(p))
		}
	}
	return strings.Join(parts, ".")
}

func formatColumns(columns []string) string {
	quoted := make([]string, len(columns))
	for i, c := range columns {
		quoted[i] = quoteIdent(c)
	}
	return strings.Join(quoted, ", ")
}

func formatColumnDefinition(c *ColumnSnapshot, includePK bool) string {
	parts := []string{quoteIdent(c.Name), c.Type}
	if includePK && c.PrimaryKey {
		parts = append(parts, "PRIMARY KEY")
	}
	if !c.Nullable {
		parts = append(parts, "NOT NULL")
	}
	if c.Default != nil {
		parts = append(parts, "DEFAULT "+*c.Default)
	}
	return strings.Join(parts, " ")
}

func buildCreateIndex(tableID string, ix *IndexSnapshot) string {
	unique := ""
	if ix.Unique {
		unique = "UNIQUE "
	}
	return fmt.Sprintf("CREATE %sINDEX %s ON %s (%s);",
		unique, quoteIdent(ix.Name), quoteTableID(tableID), formatColumns(ix.Columns))
}

func buildDropIndex(tableID string, ix *IndexSnapshot, dialect string) string {
	// MySQL / MariaDB require "ON tableName" for DROP INDEX.
	if dialect == DialectMySQL {
		return fmt.Sprintf("DROP INDEX %s ON %s;", quoteIdent(ix.Name), quoteTableID(tableID))
	}
	return fmt.Sprintf("DROP INDEX IF EXISTS %s;", quoteIdent(ix.Name))
}

func pushColumnChangeStatements(stmts []string, tableID string, cd ColumnDiff) []string {
	switch cd.Type {
	case "added":
		stmts = append(stmts,
			fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s;", quoteTableID(tableID), formatColumnDefinition(cd.Column, false)))
		if cd.Column.PrimaryKey {
			stmts = append(stmts,
				fmt.Sprintf("-- Review primary key change for %s.%s manually.",
					quoteTableID(tableID), quoteIdent(cd.Column.Name)))
		}
		return stmts
	case "removed":
		return append(stmts,
			fmt.Sprintf("ALTER TABLE %s DROP COLUMN %s;", quoteTableID(tableID), quoteIdent(cd.Column.Name)))
	}
	for _, change := range cd.Changes {
		switch change.Field {
		case "type":
			stmts = append(stmts,
				fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s TYPE %s;",
					quoteTableID(tableID), quoteIdent(cd.ColumnName), cd.After.Type))
		case "nullable":
			action := "SET"
			if cd.After.Nullable {
				action = "DROP"
			}
			stmts = append(stmts,
				fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s %s NOT NULL;",
					quoteTableID(tableID), quoteIdent(cd.ColumnName), action))
		case "default":
			if cd.After.Default == nil {
				stmts = append(stmts,
					fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s DROP DEFAULT;",
						quoteTableID(tableID), quoteIdent(cd.ColumnName)))
			} else {
				stmts = append(stmts,
					fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s SET DEFAULT %s;",
						quoteTableID(tableID), quoteIdent(cd.ColumnName), *cd.After.Default))
			}
		case "primaryKey":
			stmts = append(stmts,
				fmt.Sprintf("-- Review primary key change for %s.%s manually.",
					quoteTableID(tableID), quoteIdent(cd.ColumnName)))
		}
	}
	return stmts
}

// GenerateMigration ports generateMigrationFromDiff.
func GenerateMigration(diff *DiffResult, dialect string) *MigrationResult {
	if dialect == "" {
		dialect = defaultDialect
	}
	stmts := []string{
		fmt.Sprintf("-- Migration: %s → %s", diff.FromSnapshot.CapturedAt, diff.ToSnapshot.CapturedAt),
		"",
	}
	for _, td := range diff.TableDiffs {
		switch td.Type {
		case "added":
			var pkCols []string
			for _, c := range td.Table.Columns {
				if c.PrimaryKey {
					pkCols = append(pkCols, c.Name)
				}
			}
			hasCompositePK := len(pkCols) > 1
			defs := make([]string, len(td.Table.Columns))
			for i, c := range td.Table.Columns {
				defs[i] = "  " + formatColumnDefinition(&c, !hasCompositePK)
			}
			create := fmt.Sprintf("CREATE TABLE %s (\n%s", quoteTableID(td.TableID), strings.Join(defs, ",\n"))
			if hasCompositePK {
				quoted := make([]string, len(pkCols))
				for i, n := range pkCols {
					quoted[i] = quoteIdent(n)
				}
				create += ",\n  PRIMARY KEY (" + strings.Join(quoted, ", ") + ")"
			}
			create += "\n);"
			stmts = append(stmts, create)
			for i := range td.Table.Indexes {
				if !td.Table.Indexes[i].Primary {
					stmts = append(stmts, buildCreateIndex(td.TableID, &td.Table.Indexes[i]))
				}
			}
			stmts = append(stmts, "")
		case "removed":
			stmts = append(stmts, fmt.Sprintf("DROP TABLE IF EXISTS %s;", quoteTableID(td.TableID)), "")
		case "changed":
			for _, cd := range td.ColumnDiffs {
				stmts = pushColumnChangeStatements(stmts, td.TableID, cd)
			}
			for _, id := range td.IndexDiffs {
				// Skip PK indexes — handled as PK constraint changes (manual review).
				isPrimary := (id.Type == "added" && id.Index.Primary) ||
					(id.Type == "removed" && id.Index.Primary) ||
					(id.Type == "changed" && (id.Before.Primary || id.After.Primary))
				if isPrimary {
					name := id.IndexName
					if id.Type != "changed" {
						name = id.Index.Name
					}
					stmts = append(stmts, fmt.Sprintf("-- Review primary key index %q manually.", name))
					continue
				}
				switch id.Type {
				case "added":
					stmts = append(stmts, buildCreateIndex(td.TableID, id.Index))
				case "removed":
					stmts = append(stmts, buildDropIndex(td.TableID, id.Index, dialect))
				case "changed":
					stmts = append(stmts, buildDropIndex(td.TableID, id.Before, dialect))
					stmts = append(stmts, buildCreateIndex(td.TableID, id.After))
				}
			}
			if len(td.ColumnDiffs) > 0 || len(td.IndexDiffs) > 0 {
				stmts = append(stmts, "")
			}
		}
	}
	return &MigrationResult{
		Statements:   stmts,
		Dialect:      dialect,
		FromSnapshot: diff.FromSnapshot.CapturedAt,
		ToSnapshot:   diff.ToSnapshot.CapturedAt,
	}
}
