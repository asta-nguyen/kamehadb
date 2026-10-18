package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

// renderTableDdl is the shared CREATE TABLE + index renderer from
// schema-context.ts.
func renderTableDdl(table engines.TableInfo, columns []engines.ColumnInfo, indexes []engines.IndexInfo) string {
	var lines []string
	name := table.Name
	if table.Schema != "" {
		name = table.Schema + "." + table.Name
	}
	lines = append(lines, fmt.Sprintf("CREATE TABLE %s (", name))
	colLines := make([]string, 0, len(columns))
	for _, col := range columns {
		parts := []string{fmt.Sprintf("  %s %s", col.Name, col.Type)}
		if !col.Nullable {
			parts = append(parts, "NOT NULL")
		}
		if col.Default != nil {
			parts = append(parts, "DEFAULT "+*col.Default)
		}
		if col.PrimaryKey {
			parts = append(parts, "PRIMARY KEY")
		}
		if col.ForeignKey != nil {
			ref := col.ForeignKey.Table
			if col.ForeignKey.Schema != "" {
				ref = col.ForeignKey.Schema + "." + ref
			}
			parts = append(parts, fmt.Sprintf("REFERENCES %s(%s)", ref, col.ForeignKey.Column))
		}
		colLines = append(colLines, strings.Join(parts, " "))
	}
	lines = append(lines, strings.Join(colLines, ",\n"))
	lines = append(lines, ");")

	for _, idx := range indexes {
		if idx.Primary {
			continue
		}
		unique := ""
		if idx.Unique {
			unique = "UNIQUE "
		}
		lines = append(lines, fmt.Sprintf("CREATE %sINDEX %s ON %s (%s);", unique, idx.Name, name, strings.Join(idx.Columns, ", ")))
	}
	return strings.Join(lines, "\n")
}

// BuildSchemaContext renders DDL for every table in every schema.
func BuildSchemaContext(ctx context.Context, adapter engines.SQLAdapter) (string, error) {
	schemas, err := adapter.ListSchemas(ctx, nil)
	if err != nil {
		return "", err
	}
	var lines []string
	for _, schema := range schemas {
		tables, err := adapter.ListTables(ctx, &schema.Name)
		if err != nil {
			return "", err
		}
		for _, table := range tables {
			columns, err := adapter.GetTableColumns(ctx, table.ID)
			if err != nil {
				return "", err
			}
			indexes, err := adapter.GetTableIndexes(ctx, table.ID)
			if err != nil {
				return "", err
			}
			lines = append(lines, renderTableDdl(table, columns, indexes), "")
		}
	}
	return strings.Join(lines, "\n"), nil
}

// BuildTableSchemaContext renders DDL for one table by id; returns "" when the
// table isn't found (the TS null).
func BuildTableSchemaContext(ctx context.Context, adapter engines.SQLAdapter, tableID string) (string, error) {
	schemas, err := adapter.ListSchemas(ctx, nil)
	if err != nil {
		return "", err
	}
	for _, schema := range schemas {
		tables, err := adapter.ListTables(ctx, &schema.Name)
		if err != nil {
			return "", err
		}
		for _, table := range tables {
			if table.ID != tableID {
				continue
			}
			columns, err := adapter.GetTableColumns(ctx, tableID)
			if err != nil {
				return "", err
			}
			indexes, err := adapter.GetTableIndexes(ctx, tableID)
			if err != nil {
				return "", err
			}
			return renderTableDdl(table, columns, indexes), nil
		}
	}
	return "", nil
}
