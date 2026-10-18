package store

import "database/sql"

// QueryHistoryEntry mirrors a query_history row.
type QueryHistoryEntry struct {
	ID           string  `json:"id"`
	ConnectionID string  `json:"connectionId"`
	Query        string  `json:"query"`
	ExecutedAt   string  `json:"executedAt"`
	DurationMs   *int64  `json:"durationMs,omitempty"`
	RowCount     *int64  `json:"rowCount,omitempty"`
	Favorite     bool    `json:"favorite"`
	Name         *string `json:"name,omitempty"`
}

func (s *Store) SaveQueryHistory(connectionID, query string, durationMs, rowCount *int64) (*QueryHistoryEntry, error) {
	entry := &QueryHistoryEntry{
		ID:           newID(),
		ConnectionID: connectionID,
		Query:        query,
		ExecutedAt:   nowISO(),
		DurationMs:   durationMs,
		RowCount:     rowCount,
	}
	_, err := s.db.Exec(
		`INSERT INTO query_history (id, connection_id, query, executed_at, duration_ms, row_count)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		entry.ID, entry.ConnectionID, entry.Query, entry.ExecutedAt, entry.DurationMs, entry.RowCount)
	if err != nil {
		return nil, err
	}
	return entry, nil
}

// GetQueryHistory returns newest-first; favoritesOnly restricts to
// favorite = 1 like the sidecar query.
func (s *Store) GetQueryHistory(connectionID string, limit int, favoritesOnly bool) ([]QueryHistoryEntry, error) {
	if limit <= 0 {
		limit = 50
	}
	where := `WHERE connection_id = ?`
	if favoritesOnly {
		where += ` AND favorite = 1`
	}
	rows, err := s.db.Query(
		`SELECT id, connection_id, query, executed_at, duration_ms, row_count, favorite, name
		 FROM query_history `+where+` ORDER BY executed_at DESC LIMIT ?`,
		connectionID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []QueryHistoryEntry
	for rows.Next() {
		var e QueryHistoryEntry
		var dur, cnt sql.NullInt64
		var fav int64
		var name sql.NullString
		if err := rows.Scan(&e.ID, &e.ConnectionID, &e.Query, &e.ExecutedAt, &dur, &cnt, &fav, &name); err != nil {
			return nil, err
		}
		e.DurationMs = nullInt(dur)
		e.RowCount = nullInt(cnt)
		e.Favorite = fav == 1
		e.Name = nullStr(name)
		out = append(out, e)
	}
	return out, rows.Err()
}

// UpdateQueryHistory applies only the fields present in the input.
func (s *Store) UpdateQueryHistory(id string, favorite *bool, name *string) error {
	if favorite != nil {
		v := int64(0)
		if *favorite {
			v = 1
		}
		if _, err := s.db.Exec(`UPDATE query_history SET favorite = ? WHERE id = ?`, v, id); err != nil {
			return err
		}
	}
	if name != nil {
		if _, err := s.db.Exec(`UPDATE query_history SET name = ? WHERE id = ?`, *name, id); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) DeleteQueryHistory(id string) error {
	_, err := s.db.Exec(`DELETE FROM query_history WHERE id = ?`, id)
	return err
}
