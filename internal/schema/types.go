// Package schema ports the sidecar's schema lifecycle: snapshots
// (schema-tools.ts types), diff (schema-diff.ts), migration generation
// (schema-migration.ts) and the watcher (schema-watcher.ts).
package schema

// Types below mirror packages/shared/src/schema-tools.ts field-for-field so
// generated Wails bindings match the shared TS contract.

type ColumnSnapshot struct {
	Name       string  `json:"name"`
	Type       string  `json:"type"`
	Nullable   bool    `json:"nullable"`
	Default    *string `json:"default"`
	PrimaryKey bool    `json:"primaryKey"`
}

type IndexSnapshot struct {
	Name    string   `json:"name"`
	Columns []string `json:"columns"`
	Unique  bool     `json:"unique"`
	Primary bool     `json:"primary"`
}

type TableSnapshot struct {
	ID      string           `json:"id"`
	Name    string           `json:"name"`
	Schema  string           `json:"schema,omitempty"`
	Columns []ColumnSnapshot `json:"columns"`
	Indexes []IndexSnapshot  `json:"indexes"`
}

type SnapshotSource string

const (
	SourceManual      SnapshotSource = "manual"
	SourceAutoCadence SnapshotSource = "auto-cadence"
	SourceAutoNotify  SnapshotSource = "auto-notify"
)

type SnapshotRecord struct {
	ID           string          `json:"id"`
	ConnectionID string          `json:"connectionId"`
	CapturedAt   string          `json:"capturedAt"`
	Tables       []TableSnapshot `json:"tables"`
	Source       SnapshotSource  `json:"source,omitempty"`
}

type SnapshotSummary struct {
	ID           string         `json:"id"`
	ConnectionID string         `json:"connectionId"`
	CapturedAt   string         `json:"capturedAt"`
	TableCount   int            `json:"tableCount"`
	Source       SnapshotSource `json:"source,omitempty"`
}

// ChangeDescriptor carries one changelog row. Type is the discriminator;
// the optional fields fill per type (table_added, column_changed, ...).
type ChangeDescriptor struct {
	Type     string   `json:"type"`
	Table    string   `json:"table"`
	Column   string   `json:"column,omitempty"`
	DataType string   `json:"dataType,omitempty"`
	From     string   `json:"from,omitempty"`
	To       string   `json:"to,omitempty"`
	Index    string   `json:"index,omitempty"`
	Columns  []string `json:"columns,omitempty"`
}

type ChangelogEntry struct {
	SnapshotID string             `json:"snapshotId"`
	CapturedAt string             `json:"capturedAt"`
	Changes    []ChangeDescriptor `json:"changes"`
}

type Changelog struct {
	Entries []ChangelogEntry `json:"entries"`
}

type DiffInput struct {
	FromSnapshotID string `json:"fromSnapshotId"`
	ToSnapshotID   string `json:"toSnapshotId"`
}

// ValueChange is SchemaValueChange — from/to are string|bool|null|string[].
type ValueChange struct {
	Field string `json:"field"`
	From  any    `json:"from"`
	To    any    `json:"to"`
}

type ColumnDiff struct {
	Type       string          `json:"type"`
	Column     *ColumnSnapshot `json:"column,omitempty"`
	ColumnName string          `json:"columnName,omitempty"`
	Before     *ColumnSnapshot `json:"before,omitempty"`
	After      *ColumnSnapshot `json:"after,omitempty"`
	Changes    []ValueChange   `json:"changes,omitempty"`
}

type IndexDiff struct {
	Type      string         `json:"type"`
	Index     *IndexSnapshot `json:"index,omitempty"`
	IndexName string         `json:"indexName,omitempty"`
	Before    *IndexSnapshot `json:"before,omitempty"`
	After     *IndexSnapshot `json:"after,omitempty"`
	Changes   []ValueChange  `json:"changes,omitempty"`
}

type TableDiff struct {
	Type        string         `json:"type"`
	TableID     string         `json:"tableId"`
	Table       *TableSnapshot `json:"table,omitempty"`
	TableName   string         `json:"tableName,omitempty"`
	Schema      string         `json:"schema,omitempty"`
	ColumnDiffs []ColumnDiff   `json:"columnDiffs,omitempty"`
	IndexDiffs  []IndexDiff    `json:"indexDiffs,omitempty"`
	ChangeCount int            `json:"changeCount,omitempty"`
}

type DiffStats struct {
	TableAdds      int `json:"tableAdds"`
	TableRemovals  int `json:"tableRemovals"`
	TableChanges   int `json:"tableChanges"`
	ColumnAdds     int `json:"columnAdds"`
	ColumnRemovals int `json:"columnRemovals"`
	ColumnChanges  int `json:"columnChanges"`
	IndexAdds      int `json:"indexAdds"`
	IndexRemovals  int `json:"indexRemovals"`
	IndexChanges   int `json:"indexChanges"`
	TotalChanges   int `json:"totalChanges"`
}

type DiffResult struct {
	FromSnapshot SnapshotSummary `json:"fromSnapshot"`
	ToSnapshot   SnapshotSummary `json:"toSnapshot"`
	TableDiffs   []TableDiff     `json:"tableDiffs"`
	Stats        DiffStats       `json:"stats"`
}

type MigrationResult struct {
	Statements   []string `json:"statements"`
	Dialect      string   `json:"dialect"`
	FromSnapshot string   `json:"fromSnapshot"`
	ToSnapshot   string   `json:"toSnapshot"`
}

type WatcherStatus struct {
	CadenceRunning bool   `json:"cadenceRunning"`
	NotifyRunning  bool   `json:"notifyRunning"`
	IntervalMs     int64  `json:"intervalMs"`
	LastCaptureAt  string `json:"lastCaptureAt"`
}
