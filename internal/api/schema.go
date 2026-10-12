package api

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/schema"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// SchemaService ports routes/sql-schema.ts — snapshots, changelog, diff,
// migration generation, and the watcher controls.
type SchemaService struct {
	st       *store.Store
	registry *engines.Registry
	watcher  *schema.WatcherManager
}

func NewSchemaService(st *store.Store, registry *engines.Registry, watcher *schema.WatcherManager) *SchemaService {
	s := &SchemaService{st: st, registry: registry, watcher: watcher}
	// Same injection as sql-schema.ts → schemaWatcher.setCaptureFn.
	watcher.SetCaptureFunc(func(connectionID string, source schema.SnapshotSource) error {
		adapter, err := registry.Get(context.Background(), connectionID)
		if err != nil {
			return err
		}
		_, err = s.capture(connectionID, adapter, source)
		return err
	})
	return s
}

type captureResult struct {
	ID         string `json:"id"`
	CapturedAt string `json:"capturedAt"`
	TableCount int    `json:"tableCount"`
}

// capture ports captureSnapshot: tables from every schema, columns+indexes
// per table, then persist + prune to WatcherMaxSnapshots.
func (s *SchemaService) capture(connectionID string, adapter engines.SQLAdapter, source schema.SnapshotSource) (*captureResult, error) {
	ctx := context.Background()
	schemas, err := adapter.ListSchemas(ctx, nil)
	if err != nil {
		return nil, err
	}
	var allTables []engines.TableInfo
	if len(schemas) == 0 {
		tables, err := adapter.ListTables(ctx, nil)
		if err != nil {
			return nil, err
		}
		allTables = tables
	} else {
		for _, sc := range schemas {
			name := sc.Name
			tables, err := adapter.ListTables(ctx, &name)
			if err != nil {
				return nil, err
			}
			allTables = append(allTables, tables...)
		}
	}
	if len(allTables) == 0 {
		return nil, errors.New("No tables found in this database")
	}

	snap := schema.SnapshotRecord{
		ConnectionID: connectionID,
		CapturedAt:   time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
		Source:       source,
	}
	for _, t := range allTables {
		cols, err := adapter.GetTableColumns(ctx, t.ID)
		if err != nil {
			return nil, err
		}
		idxs, err := adapter.GetTableIndexes(ctx, t.ID)
		if err != nil {
			return nil, err
		}
		ts := schema.TableSnapshot{
			ID: t.ID, Name: t.Name, Schema: t.Schema,
			Columns: make([]schema.ColumnSnapshot, len(cols)),
			Indexes: make([]schema.IndexSnapshot, len(idxs)),
		}
		for i, c := range cols {
			ts.Columns[i] = schema.ColumnSnapshot{
				Name: c.Name, Type: c.Type, Nullable: c.Nullable,
				Default: c.Default, PrimaryKey: c.PrimaryKey,
			}
		}
		for i, ix := range idxs {
			ts.Indexes[i] = schema.IndexSnapshot{
				Name: ix.Name, Columns: ix.Columns,
				Unique: ix.Unique, Primary: ix.Primary,
			}
		}
		snap.Tables = append(snap.Tables, ts)
	}

	data, err := json.Marshal(snap)
	if err != nil {
		return nil, err
	}
	id, err := s.st.SaveSchemaSnapshot(connectionID, string(data))
	if err != nil {
		return nil, err
	}
	if err := s.st.DeleteOldSchemaSnapshots(connectionID, schema.WatcherMaxSnapshots); err != nil {
		return nil, err
	}
	return &captureResult{ID: id, CapturedAt: snap.CapturedAt, TableCount: len(snap.Tables)}, nil
}

// loadSnapshot ports loadSnapshot + hydrateSnapshot: the stored blob has no
// id; the row id hydrates it, and cross-connection reads return nil.
func (s *SchemaService) loadSnapshot(connectionID, snapshotID string) (*schema.SnapshotRecord, error) {
	raw, err := s.st.GetSchemaSnapshotData(snapshotID)
	if err != nil || raw == "" {
		return nil, err
	}
	var snap schema.SnapshotRecord
	if err := json.Unmarshal([]byte(raw), &snap); err != nil {
		return nil, err
	}
	snap.ID = snapshotID
	if snap.ConnectionID != connectionID {
		return nil, nil
	}
	return &snap, nil
}

func summary(s *schema.SnapshotRecord) schema.SnapshotSummary {
	return schema.SnapshotSummary{
		ID: s.ID, ConnectionID: s.ConnectionID,
		CapturedAt: s.CapturedAt, TableCount: len(s.Tables), Source: s.Source,
	}
}

// CaptureSchemaSnapshot — POST /sql/:id/schema/snapshots.
func (s *SchemaService) CaptureSchemaSnapshot(connectionID string) (*captureResult, error) {
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	return s.capture(connectionID, adapter, schema.SourceManual)
}

// GetSchemaSnapshots — GET /sql/:id/schema/snapshots.
func (s *SchemaService) GetSchemaSnapshots(connectionID string) (map[string]any, error) {
	entries, err := s.st.GetSchemaSnapshots(connectionID)
	if err != nil {
		return nil, err
	}
	out := []schema.SnapshotSummary{}
	for _, e := range entries {
		snap, err := s.loadSnapshot(connectionID, e.ID)
		if err != nil {
			return nil, err
		}
		if snap != nil {
			out = append(out, summary(snap))
		}
	}
	return map[string]any{"snapshots": out}, nil
}

// GetSchemaChangelog — GET /sql/:id/schema/changelog. Pairwise diffs of
// consecutive snapshots (ASC order).
func (s *SchemaService) GetSchemaChangelog(connectionID string) (*schema.Changelog, error) {
	entries, err := s.st.GetSchemaSnapshots(connectionID)
	if err != nil {
		return nil, err
	}
	cl := &schema.Changelog{Entries: []schema.ChangelogEntry{}}
	if len(entries) == 0 {
		return cl, nil
	}
	for i, e := range entries {
		snap, err := s.loadSnapshot(connectionID, e.ID)
		if err != nil {
			return nil, err
		}
		if snap == nil {
			continue
		}
		if i == 0 {
			cl.Entries = append(cl.Entries, schema.ChangelogEntry{
				SnapshotID: snap.ID, CapturedAt: snap.CapturedAt,
				Changes: []schema.ChangeDescriptor{},
			})
			continue
		}
		prev, err := s.loadSnapshot(connectionID, entries[i-1].ID)
		if err != nil {
			return nil, err
		}
		if prev == nil {
			continue
		}
		cl.Entries = append(cl.Entries, schema.ChangelogEntry{
			SnapshotID: snap.ID, CapturedAt: snap.CapturedAt,
			Changes: schema.ToChangelogChanges(schema.CompareSnapshots(prev, snap)),
		})
	}
	return cl, nil
}

// GetSchemaDiff — POST /sql/:id/schema/diff.
func (s *SchemaService) GetSchemaDiff(connectionID string, input schema.DiffInput) (*schema.DiffResult, error) {
	from, err := s.loadSnapshot(connectionID, input.FromSnapshotID)
	if err != nil {
		return nil, err
	}
	to, err := s.loadSnapshot(connectionID, input.ToSnapshotID)
	if err != nil {
		return nil, err
	}
	if from == nil || to == nil {
		return nil, errors.New("Snapshot not found")
	}
	return schema.CompareSnapshots(from, to), nil
}

// GenerateMigration — POST /sql/:id/schema/migrations. Dialect resolves
// from the profile kind (default postgresql).
func (s *SchemaService) GenerateMigration(connectionID string, input schema.DiffInput) (*schema.MigrationResult, error) {
	dialect := schema.ResolveDialect("")
	if p, err := s.st.GetProfile(connectionID); err == nil && p != nil {
		dialect = schema.ResolveDialect(p.Kind)
	}
	from, err := s.loadSnapshot(connectionID, input.FromSnapshotID)
	if err != nil {
		return nil, err
	}
	to, err := s.loadSnapshot(connectionID, input.ToSnapshotID)
	if err != nil {
		return nil, err
	}
	if from == nil || to == nil {
		return nil, errors.New("Snapshot not found")
	}
	return schema.GenerateMigration(schema.CompareSnapshots(from, to), dialect), nil
}

// StartSchemaWatcher — POST /sql/:id/schema/watcher/start.
func (s *SchemaService) StartSchemaWatcher(connectionID string, intervalMs int64) (map[string]bool, error) {
	if intervalMs <= 0 {
		intervalMs = schema.WatcherDefaultIntervalMs
	}
	if intervalMs < schema.WatcherMinIntervalMs {
		return nil, errors.New("Minimum interval is 300000ms")
	}
	s.watcher.StartCadence(connectionID, intervalMs)
	return map[string]bool{"ok": true}, nil
}

// StopSchemaWatcher — POST /sql/:id/schema/watcher/stop.
func (s *SchemaService) StopSchemaWatcher(connectionID string) map[string]bool {
	s.watcher.StopCadence(connectionID)
	return map[string]bool{"ok": true}
}

// GetSchemaWatcherStatus — GET /sql/:id/schema/watcher/status.
func (s *SchemaService) GetSchemaWatcherStatus(connectionID string) schema.WatcherStatus {
	return s.watcher.Status(connectionID)
}

// StartSchemaNotifyWatcher — POST /sql/:id/schema/watcher/notify/start.
func (s *SchemaService) StartSchemaNotifyWatcher(connectionID string) (map[string]bool, error) {
	if err := s.watcher.StartNotify(connectionID); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

// StopSchemaNotifyWatcher — POST /sql/:id/schema/watcher/notify/stop.
func (s *SchemaService) StopSchemaNotifyWatcher(connectionID string) map[string]bool {
	s.watcher.StopNotify(connectionID)
	return map[string]bool{"ok": true}
}
