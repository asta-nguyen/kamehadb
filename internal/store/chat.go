package store

import "database/sql"

// ChatMessage mirrors a chat_messages row for the AI panel.
type ChatMessage struct {
	ID            string  `json:"id"`
	ConnectionID  string  `json:"connectionId"`
	MongoDatabase *string `json:"mongoDatabase,omitempty"`
	Role          string  `json:"role"`
	Content       string  `json:"content"`
	CreatedAt     string  `json:"createdAt"`
}

func (s *Store) SaveChatMessage(connectionID, role, content string, mongoDatabase *string) (*ChatMessage, error) {
	msg := &ChatMessage{
		ID:            newID(),
		ConnectionID:  connectionID,
		MongoDatabase: mongoDatabase,
		Role:          role,
		Content:       content,
		CreatedAt:     nowISO(),
	}
	_, err := s.db.Exec(
		`INSERT INTO chat_messages (id, connection_id, mongo_database, role, content, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		msg.ID, msg.ConnectionID, msg.MongoDatabase, msg.Role, msg.Content, msg.CreatedAt)
	if err != nil {
		return nil, err
	}
	return msg, nil
}

// GetChatMessages returns history oldest-first; a nil mongoDatabase matches
// only non-mongo threads (same IS NULL semantics as the sidecar query).
func (s *Store) GetChatMessages(connectionID string, limit int, mongoDatabase *string) ([]ChatMessage, error) {
	if limit <= 0 {
		limit = 50
	}
	var dbArg any
	if mongoDatabase != nil {
		dbArg = *mongoDatabase
	}
	rows, err := s.db.Query(
		`SELECT id, connection_id, mongo_database, role, content, created_at
		 FROM chat_messages
		 WHERE connection_id = ? AND (mongo_database IS ? OR (mongo_database IS NULL AND ? IS NULL))
		 ORDER BY created_at ASC
		 LIMIT ?`,
		connectionID, dbArg, dbArg, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChatMessage
	for rows.Next() {
		var m ChatMessage
		var mongo sql.NullString
		if err := rows.Scan(&m.ID, &m.ConnectionID, &mongo, &m.Role, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.MongoDatabase = nullStr(mongo)
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) ClearChatMessages(connectionID string, mongoDatabase *string) error {
	var err error
	if mongoDatabase != nil {
		_, err = s.db.Exec(`DELETE FROM chat_messages WHERE connection_id = ? AND mongo_database = ?`,
			connectionID, *mongoDatabase)
	} else {
		_, err = s.db.Exec(`DELETE FROM chat_messages WHERE connection_id = ? AND mongo_database IS NULL`,
			connectionID)
	}
	return err
}
