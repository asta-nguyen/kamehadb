package schema

import "sort"

// COLUMN_FIELDS / INDEX_FIELDS from lib/constants.ts.
var columnFields = []string{"type", "nullable", "default", "primaryKey"}
var indexFields = []string{"columns", "unique", "primary"}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func colField(c *ColumnSnapshot, field string) any {
	switch field {
	case "type":
		return c.Type
	case "nullable":
		return c.Nullable
	case "default":
		if c.Default == nil {
			return nil
		}
		return *c.Default
	case "primaryKey":
		return c.PrimaryKey
	}
	return nil
}

func compareColumns(before, after []ColumnSnapshot) []ColumnDiff {
	beforeByName := map[string]*ColumnSnapshot{}
	for i := range before {
		beforeByName[before[i].Name] = &before[i]
	}
	afterByName := map[string]*ColumnSnapshot{}
	for i := range after {
		afterByName[after[i].Name] = &after[i]
	}
	var diffs []ColumnDiff
	for i := range after {
		if _, ok := beforeByName[after[i].Name]; !ok {
			diffs = append(diffs, ColumnDiff{Type: "added", Column: &after[i]})
		}
	}
	for i := range before {
		if _, ok := afterByName[before[i].Name]; !ok {
			diffs = append(diffs, ColumnDiff{Type: "removed", Column: &before[i]})
		}
	}
	for i := range after {
		b := beforeByName[after[i].Name]
		if b == nil {
			continue
		}
		var changes []ValueChange
		for _, field := range columnFields {
			fv, tv := colField(b, field), colField(&after[i], field)
			if fv != tv {
				changes = append(changes, ValueChange{Field: field, From: fv, To: tv})
			}
		}
		if len(changes) > 0 {
			diffs = append(diffs, ColumnDiff{
				Type: "changed", ColumnName: after[i].Name,
				Before: b, After: &after[i], Changes: changes,
			})
		}
	}
	return diffs
}

func idxField(ix *IndexSnapshot, field string) any {
	switch field {
	case "unique":
		return ix.Unique
	case "primary":
		return ix.Primary
	}
	return nil
}

func compareIndexes(before, after []IndexSnapshot) []IndexDiff {
	beforeByName := map[string]*IndexSnapshot{}
	for i := range before {
		beforeByName[before[i].Name] = &before[i]
	}
	afterByName := map[string]*IndexSnapshot{}
	for i := range after {
		afterByName[after[i].Name] = &after[i]
	}
	var diffs []IndexDiff
	for i := range after {
		if _, ok := beforeByName[after[i].Name]; !ok {
			diffs = append(diffs, IndexDiff{Type: "added", Index: &after[i]})
		}
	}
	for i := range before {
		if _, ok := afterByName[before[i].Name]; !ok {
			diffs = append(diffs, IndexDiff{Type: "removed", Index: &before[i]})
		}
	}
	for i := range after {
		b := beforeByName[after[i].Name]
		if b == nil {
			continue
		}
		var changes []ValueChange
		if !equalStrings(b.Columns, after[i].Columns) {
			changes = append(changes, ValueChange{Field: "columns", From: b.Columns, To: after[i].Columns})
		}
		for _, field := range indexFields {
			if field == "columns" {
				continue
			}
			fv, tv := idxField(b, field), idxField(&after[i], field)
			if fv != tv {
				changes = append(changes, ValueChange{Field: field, From: fv, To: tv})
			}
		}
		if len(changes) > 0 {
			diffs = append(diffs, IndexDiff{
				Type: "changed", IndexName: after[i].Name,
				Before: b, After: &after[i], Changes: changes,
			})
		}
	}
	return diffs
}

func buildStats(tableDiffs []TableDiff) DiffStats {
	var s DiffStats
	for _, td := range tableDiffs {
		switch td.Type {
		case "added":
			s.TableAdds++
		case "removed":
			s.TableRemovals++
		case "changed":
			s.TableChanges++
			for _, cd := range td.ColumnDiffs {
				switch cd.Type {
				case "added":
					s.ColumnAdds++
				case "removed":
					s.ColumnRemovals++
				case "changed":
					s.ColumnChanges++
				}
			}
			for _, id := range td.IndexDiffs {
				switch id.Type {
				case "added":
					s.IndexAdds++
				case "removed":
					s.IndexRemovals++
				case "changed":
					s.IndexChanges++
				}
			}
		}
	}
	s.TotalChanges = s.TableAdds + s.TableRemovals + s.ColumnAdds + s.ColumnRemovals +
		s.ColumnChanges + s.IndexAdds + s.IndexRemovals + s.IndexChanges
	return s
}

func summary(s *SnapshotRecord) SnapshotSummary {
	return SnapshotSummary{
		ID: s.ID, ConnectionID: s.ConnectionID,
		CapturedAt: s.CapturedAt, TableCount: len(s.Tables),
	}
}

// CompareSnapshots ports compareSchemaSnapshots.
func CompareSnapshots(before, after *SnapshotRecord) *DiffResult {
	beforeByID := map[string]*TableSnapshot{}
	for i := range before.Tables {
		beforeByID[before.Tables[i].ID] = &before.Tables[i]
	}
	afterByID := map[string]*TableSnapshot{}
	for i := range after.Tables {
		afterByID[after.Tables[i].ID] = &after.Tables[i]
	}
	idSet := map[string]bool{}
	for id := range beforeByID {
		idSet[id] = true
	}
	for id := range afterByID {
		idSet[id] = true
	}
	ids := make([]string, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}
	sort.Strings(ids) // localeCompare on plain ascii ids

	var tableDiffs []TableDiff
	for _, tableID := range ids {
		b := beforeByID[tableID]
		a := afterByID[tableID]
		switch {
		case b == nil && a != nil:
			tableDiffs = append(tableDiffs, TableDiff{Type: "added", TableID: tableID, Table: a})
		case b != nil && a == nil:
			tableDiffs = append(tableDiffs, TableDiff{Type: "removed", TableID: tableID, Table: b})
		case b == nil:
		default:
			colDiffs := compareColumns(b.Columns, a.Columns)
			idxDiffs := compareIndexes(b.Indexes, a.Indexes)
			if len(colDiffs) == 0 && len(idxDiffs) == 0 {
				continue
			}
			tableDiffs = append(tableDiffs, TableDiff{
				Type: "changed", TableID: tableID,
				TableName: a.Name, Schema: a.Schema,
				ColumnDiffs: colDiffs, IndexDiffs: idxDiffs,
				ChangeCount: len(colDiffs) + len(idxDiffs),
			})
		}
	}
	return &DiffResult{
		FromSnapshot: summary(before),
		ToSnapshot:   summary(after),
		TableDiffs:   tableDiffs,
		Stats:        buildStats(tableDiffs),
	}
}

func columnSignature(c *ColumnSnapshot) string {
	parts := []string{c.Type}
	if c.Nullable {
		parts = append(parts, "NULL")
	} else {
		parts = append(parts, "NOT NULL")
	}
	if c.Default != nil {
		parts = append(parts, "DEFAULT "+*c.Default)
	}
	if c.PrimaryKey {
		parts = append(parts, "PRIMARY KEY")
	}
	return joinParts(parts)
}

func joinParts(p []string) string {
	out := ""
	for i, s := range p {
		if i > 0 {
			out += " "
		}
		out += s
	}
	return out
}

// ToChangelogChanges ports toSchemaChangelogChanges.
func ToChangelogChanges(diff *DiffResult) []ChangeDescriptor {
	var changes []ChangeDescriptor
	for _, td := range diff.TableDiffs {
		if td.Type == "added" {
			changes = append(changes, ChangeDescriptor{Type: "table_added", Table: td.TableID})
		}
		if td.Type == "removed" {
			changes = append(changes, ChangeDescriptor{Type: "table_removed", Table: td.TableID})
		}
		if td.Type != "changed" {
			continue
		}
		for _, cd := range td.ColumnDiffs {
			switch cd.Type {
			case "added":
				changes = append(changes, ChangeDescriptor{
					Type: "column_added", Table: td.TableID,
					Column: cd.Column.Name, DataType: cd.Column.Type,
				})
			case "removed":
				changes = append(changes, ChangeDescriptor{
					Type: "column_removed", Table: td.TableID,
					Column: cd.Column.Name, DataType: cd.Column.Type,
				})
			case "changed":
				changes = append(changes, ChangeDescriptor{
					Type: "column_changed", Table: td.TableID, Column: cd.ColumnName,
					From: columnSignature(cd.Before), To: columnSignature(cd.After),
				})
			}
		}
		for _, id := range td.IndexDiffs {
			switch id.Type {
			case "added":
				changes = append(changes, ChangeDescriptor{
					Type: "index_added", Table: td.TableID,
					Index: id.Index.Name, Columns: id.Index.Columns,
				})
			case "removed":
				changes = append(changes, ChangeDescriptor{
					Type: "index_removed", Table: td.TableID,
					Index: id.Index.Name, Columns: id.Index.Columns,
				})
			case "changed":
				changes = append(changes, ChangeDescriptor{
					Type: "index_removed", Table: td.TableID,
					Index: id.Before.Name, Columns: id.Before.Columns,
				})
				changes = append(changes, ChangeDescriptor{
					Type: "index_added", Table: td.TableID,
					Index: id.After.Name, Columns: id.After.Columns,
				})
			}
		}
	}
	return changes
}
