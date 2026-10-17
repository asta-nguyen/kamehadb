package store

import "database/sql"

// SchemaSnapshotMeta is one snapshot list entry (data loads separately).
type SchemaSnapshotMeta struct {
	ID         string `json:"id"`
	CapturedAt string `json:"capturedAt"`
}

// SchemaWatcherConfig mirrors a schema_watchers row.
type SchemaWatcherConfig struct {
	ConnectionID   string `json:"connectionId"`
	CadenceEnabled bool   `json:"cadenceEnabled"`
	NotifyEnabled  bool   `json:"notifyEnabled"`
	IntervalMs     int64  `json:"intervalMs"`
}

func (s *Store) SaveSchemaSnapshot(connectionID, snapshotData string) (string, error) {
	id := newID()
	_, err := s.db.Exec(
		`INSERT INTO schema_snapshots (id, connection_id, captured_at, snapshot_data) VALUES (?, ?, ?, ?)`,
		id, connectionID, nowISO(), snapshotData)
	return id, err
}

func (s *Store) GetSchemaSnapshots(connectionID string) ([]SchemaSnapshotMeta, error) {
	rows, err := s.db.Query(
		`SELECT id, captured_at FROM schema_snapshots WHERE connection_id = ? ORDER BY captured_at ASC`,
		connectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SchemaSnapshotMeta
	for rows.Next() {
		var m SchemaSnapshotMeta
		if err := rows.Scan(&m.ID, &m.CapturedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) GetSchemaSnapshotData(id string) (string, error) {
	var data string
	err := s.db.QueryRow(`SELECT snapshot_data FROM schema_snapshots WHERE id = ?`, id).Scan(&data)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return data, err
}

// DeleteOldSchemaSnapshots keeps only the newest `keep` rows per connection.
func (s *Store) DeleteOldSchemaSnapshots(connectionID string, keep int) error {
	_, err := s.db.Exec(
		`DELETE FROM schema_snapshots WHERE connection_id = ? AND id NOT IN (
			SELECT id FROM schema_snapshots WHERE connection_id = ? ORDER BY captured_at DESC LIMIT ?
		)`, connectionID, connectionID, keep)
	return err
}

func (s *Store) GetSchemaWatcher(connectionID string) (*SchemaWatcherConfig, error) {
	var cfg SchemaWatcherConfig
	var cadence, notify int64
	err := s.db.QueryRow(
		`SELECT connection_id, cadence_enabled, notify_enabled, interval_ms FROM schema_watchers
		 WHERE connection_id = ?`, connectionID).
		Scan(&cfg.ConnectionID, &cadence, &notify, &cfg.IntervalMs)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cfg.CadenceEnabled = cadence == 1
	cfg.NotifyEnabled = notify == 1
	return &cfg, nil
}

func (s *Store) UpsertSchemaWatcher(cfg SchemaWatcherConfig) error {
	now := nowISO()
	cadence, notify := int64(0), int64(0)
	if cfg.CadenceEnabled {
		cadence = 1
	}
	if cfg.NotifyEnabled {
		notify = 1
	}
	_, err := s.db.Exec(
		`INSERT INTO schema_watchers (connection_id, cadence_enabled, notify_enabled, interval_ms, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(connection_id) DO UPDATE SET
			cadence_enabled = excluded.cadence_enabled,
			notify_enabled = excluded.notify_enabled,
			interval_ms = excluded.interval_ms,
			updated_at = excluded.updated_at`,
		cfg.ConnectionID, cadence, notify, cfg.IntervalMs, now, now)
	return err
}

func (s *Store) DeleteSchemaWatcher(connectionID string) error {
	_, err := s.db.Exec(`DELETE FROM schema_watchers WHERE connection_id = ?`, connectionID)
	return err
}

func (s *Store) ListEnabledSchemaWatchers() ([]SchemaWatcherConfig, error) {
	rows, err := s.db.Query(
		`SELECT connection_id, cadence_enabled, notify_enabled, interval_ms FROM schema_watchers
		 WHERE cadence_enabled = 1 OR notify_enabled = 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SchemaWatcherConfig
	for rows.Next() {
		var cfg SchemaWatcherConfig
		var cadence, notify int64
		if err := rows.Scan(&cfg.ConnectionID, &cadence, &notify, &cfg.IntervalMs); err != nil {
			return nil, err
		}
		cfg.CadenceEnabled = cadence == 1
		cfg.NotifyEnabled = notify == 1
		out = append(out, cfg)
	}
	return out, rows.Err()
}
