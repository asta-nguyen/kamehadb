package store

// EmbeddingRef is the hash kept per indexed table for staleness checks.
type EmbeddingRef struct {
	TableID string `json:"tableId"`
	Hash    string `json:"hash"`
}

func (s *Store) UpsertEmbedding(connectionID, tableID, ddl, hash string) error {
	_, err := s.db.Exec(
		`INSERT OR REPLACE INTO schema_embeddings (connection_id, table_id, ddl, hash) VALUES (?, ?, ?, ?)`,
		connectionID, tableID, ddl, hash)
	return err
}

func (s *Store) ListEmbeddingRefs(connectionID string) ([]EmbeddingRef, error) {
	rows, err := s.db.Query(
		`SELECT table_id, hash FROM schema_embeddings WHERE connection_id = ?`, connectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EmbeddingRef
	for rows.Next() {
		var r EmbeddingRef
		if err := rows.Scan(&r.TableID, &r.Hash); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) ListEmbeddingTableIDs(connectionID string) ([]string, error) {
	rows, err := s.db.Query(
		`SELECT table_id FROM schema_embeddings WHERE connection_id = ?`, connectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (s *Store) DeleteEmbedding(connectionID, tableID string) error {
	_, err := s.db.Exec(
		`DELETE FROM schema_embeddings WHERE connection_id = ? AND table_id = ?`,
		connectionID, tableID)
	return err
}

func (s *Store) DeleteAllEmbeddings() error {
	_, err := s.db.Exec(`DELETE FROM schema_embeddings`)
	return err
}

func (s *Store) CountEmbeddings(connectionID string) (int64, error) {
	var n int64
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM schema_embeddings WHERE connection_id = ?`, connectionID).Scan(&n)
	return n, err
}

// The TS original kept vectors in a sqlite-vec vec0 virtual table. That
// extension isn't available under modernc.org/sqlite, so vectors live in a
// plain table as little-endian float32 blobs and the ai package does the
// distance scan in Go — identical top-K semantics.

func (s *Store) ensureVectorTable() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS schema_embedding_vectors (
		connection_id TEXT NOT NULL,
		table_id      TEXT NOT NULL,
		embedding     BLOB NOT NULL,
		PRIMARY KEY (connection_id, table_id)
	)`)
	return err
}

func (s *Store) UpsertEmbeddingVector(connectionID, tableID string, blob []byte) error {
	if err := s.ensureVectorTable(); err != nil {
		return err
	}
	_, err := s.db.Exec(
		`INSERT OR REPLACE INTO schema_embedding_vectors (connection_id, table_id, embedding) VALUES (?, ?, ?)`,
		connectionID, tableID, blob)
	return err
}

func (s *Store) DeleteEmbeddingVector(connectionID, tableID string) error {
	if err := s.ensureVectorTable(); err != nil {
		return err
	}
	_, err := s.db.Exec(
		`DELETE FROM schema_embedding_vectors WHERE connection_id = ? AND table_id = ?`,
		connectionID, tableID)
	return err
}

// ListEmbeddingVectors returns (table_id, ddl, blob) joined with
// schema_embeddings — same join the TS search query did.
func (s *Store) ListEmbeddingVectors(connectionID string) ([]VectorRow, error) {
	if err := s.ensureVectorTable(); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(
		`SELECT v.table_id, e.ddl, v.embedding
		 FROM schema_embedding_vectors v
		 JOIN schema_embeddings e ON e.connection_id = v.connection_id AND e.table_id = v.table_id
		 WHERE v.connection_id = ?`, connectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []VectorRow
	for rows.Next() {
		var r VectorRow
		if err := rows.Scan(&r.TableID, &r.DDL, &r.Blob); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// VectorRow is one stored embedding joined to its DDL.
type VectorRow struct {
	TableID string
	DDL     string
	Blob    []byte
}

// DeleteAllEmbeddingVectors clears the vector table (dimension-change reset).
func (s *Store) DeleteAllEmbeddingVectors() error {
	if err := s.ensureVectorTable(); err != nil {
		return err
	}
	_, err := s.db.Exec(`DELETE FROM schema_embedding_vectors`)
	return err
}
