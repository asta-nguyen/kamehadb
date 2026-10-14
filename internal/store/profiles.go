package store

import (
	"database/sql"
	"fmt"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

// Profile mirrors connection_profiles. Nullable columns use pointers so
// generated bindings emit optional fields like the TS contract.
type Profile struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	Kind             string  `json:"kind"`
	Host             *string `json:"host,omitempty"`
	Port             *int64  `json:"port,omitempty"`
	Database         *string `json:"database,omitempty"`
	Username         *string `json:"username,omitempty"`
	SSL              bool    `json:"ssl"`
	FilePath         *string `json:"filePath,omitempty"`
	Color            *string `json:"color,omitempty"`
	ConnectionString *string `json:"connectionString,omitempty"`
	MCPEnabled       bool    `json:"mcpEnabled"`
	CreatedAt        string  `json:"createdAt"`
	UpdatedAt        string  `json:"updatedAt"`
}

// ProfileInput carries create/update fields; nil means absent on update.
// JSON tags match the shared CreateConnectionProfileInput shape.
type ProfileInput struct {
	Name             *string `json:"name,omitempty"`
	Kind             *string `json:"kind,omitempty"`
	Host             *string `json:"host,omitempty"`
	Port             *int64  `json:"port,omitempty"`
	Database         *string `json:"database,omitempty"`
	Username         *string `json:"username,omitempty"`
	Password         *string `json:"password,omitempty"`
	SSL              *bool   `json:"ssl,omitempty"`
	FilePath         *string `json:"filePath,omitempty"`
	Color            *string `json:"color,omitempty"`
	ConnectionString *string `json:"connectionString,omitempty"`
}

const profileColumns = `id, name, kind, host, port, database, username, ssl,
	file_path, color, connection_string, mcp_enabled, created_at, updated_at`

func (s *Store) ListProfiles() ([]Profile, error) {
	rows, err := s.db.Query(
		`SELECT ` + profileColumns + ` FROM connection_profiles ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	// Wails must serialize an empty list as [] rather than null for the welcome UI.
	out := make([]Profile, 0)
	for rows.Next() {
		p, err := scanProfile(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) GetProfile(id string) (*Profile, error) {
	row := s.db.QueryRow(`SELECT `+profileColumns+` FROM connection_profiles WHERE id = ?`, id)
	p, err := scanProfileRow(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) GetProfilePassword(id string) (string, error) {
	var password sql.NullString
	err := s.db.QueryRow(`SELECT password FROM connection_profiles WHERE id = ?`, id).Scan(&password)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return password.String, nil
}

func (s *Store) hasProfilePassword(id string) (bool, error) {
	var password sql.NullString
	err := s.db.QueryRow(`SELECT password FROM connection_profiles WHERE id = ?`, id).Scan(&password)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return password.Valid, nil
}

// ProfileForConnect implements engines.ProfileLoader: profile fields plus
// the saved password flattened into the connect contract.
func (s *Store) ProfileForConnect(id string) (engines.ConnProfile, error) {
	p, err := s.GetProfile(id)
	if err != nil {
		return engines.ConnProfile{}, err
	}
	if p == nil {
		return engines.ConnProfile{}, engines.ErrConnectionNotFound
	}
	password, err := s.GetProfilePassword(id)
	if err != nil {
		return engines.ConnProfile{}, err
	}
	hasPassword, err := s.hasProfilePassword(id)
	if err != nil {
		return engines.ConnProfile{}, err
	}
	cp := engines.ConnProfile{
		Kind:        p.Kind,
		SSL:         p.SSL,
		Password:    password,
		HasPassword: hasPassword,
	}
	if p.Host != nil {
		cp.Host = *p.Host
	}
	if p.Port != nil {
		cp.Port = *p.Port
	}
	if p.Database != nil {
		cp.Database = *p.Database
	}
	if p.Username != nil {
		cp.Username = *p.Username
	}
	if p.FilePath != nil {
		cp.FilePath = *p.FilePath
	}
	if p.ConnectionString != nil {
		cp.ConnectionString = *p.ConnectionString
	}
	return cp, nil
}

func (s *Store) CreateProfile(in ProfileInput) (*Profile, error) {
	id := newID()
	now := nowISO()
	ssl := int64(0)
	if in.SSL != nil && *in.SSL {
		ssl = 1
	}
	_, err := s.db.Exec(
		`INSERT INTO connection_profiles (id, name, kind, host, port, database, username, password,
			ssl, file_path, color, connection_string, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, strVal(in.Name), strVal(in.Kind), in.Host, in.Port, in.Database, in.Username,
		in.Password, ssl, in.FilePath, in.Color, in.ConnectionString, now, now)
	if err != nil {
		return nil, err
	}
	return s.GetProfile(id)
}

func (s *Store) UpdateProfile(id string, in ProfileInput) (*Profile, error) {
	existing, err := s.GetProfile(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, nil
	}
	var existingPassword sql.NullString
	if err := s.db.QueryRow(`SELECT password FROM connection_profiles WHERE id = ?`, id).Scan(&existingPassword); err != nil {
		return nil, err
	}
	ssl := int64(0)
	switch {
	case in.SSL != nil && *in.SSL:
		ssl = 1
	case in.SSL == nil && existing.SSL:
		ssl = 1
	}
	password := any(nil)
	if in.Password != nil {
		password = *in.Password
	} else if existingPassword.Valid {
		password = existingPassword.String
	}
	_, err = s.db.Exec(
		`UPDATE connection_profiles SET
			name = ?, kind = ?, host = ?, port = ?, database = ?, username = ?, password = ?,
			ssl = ?, file_path = ?, color = ?, connection_string = ?, updated_at = ?
		 WHERE id = ?`,
		orStr(in.Name, existing.Name), orStr(in.Kind, existing.Kind),
		orPtr(in.Host, existing.Host), orInt(in.Port, existing.Port),
		orPtr(in.Database, existing.Database), orPtr(in.Username, existing.Username),
		password, ssl,
		orPtr(in.FilePath, existing.FilePath), orPtr(in.Color, existing.Color),
		orPtr(in.ConnectionString, existing.ConnectionString), nowISO(), id)
	if err != nil {
		return nil, err
	}
	return s.GetProfile(id)
}

func (s *Store) DeleteProfile(id string) (bool, error) {
	res, err := s.db.Exec(`DELETE FROM connection_profiles WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// scanProfile reads one row. Legacy databases may store id as INTEGER
// (AUTOINCREMENT variant); scanning into any and stringifying keeps those
// rows readable exactly like the TS rowToProfile cast.
func scanProfile(rows *sql.Rows) (Profile, error) {
	var p Profile
	var id any
	var host, database, username, filePath, color, connStr sql.NullString
	var port sql.NullInt64
	var ssl, mcp int64
	err := rows.Scan(&id, &p.Name, &p.Kind, &host, &port, &database, &username,
		&ssl, &filePath, &color, &connStr, &mcp, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return p, err
	}
	fillProfile(&p, id, host, port, database, username, filePath, color, connStr, ssl, mcp)
	return p, nil
}

func scanProfileRow(row *sql.Row) (Profile, error) {
	var p Profile
	var id any
	var host, database, username, filePath, color, connStr sql.NullString
	var port sql.NullInt64
	var ssl, mcp int64
	err := row.Scan(&id, &p.Name, &p.Kind, &host, &port, &database, &username,
		&ssl, &filePath, &color, &connStr, &mcp, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return p, err
	}
	fillProfile(&p, id, host, port, database, username, filePath, color, connStr, ssl, mcp)
	return p, nil
}

func fillProfile(p *Profile, id any, host sql.NullString, port sql.NullInt64,
	database, username, filePath, color, connStr sql.NullString, ssl, mcp int64) {
	p.ID = fmt.Sprint(id)
	p.Host = nullStr(host)
	p.Port = nullInt(port)
	p.Database = nullStr(database)
	p.Username = nullStr(username)
	p.SSL = ssl == 1
	p.FilePath = nullStr(filePath)
	p.Color = nullStr(color)
	p.ConnectionString = nullStr(connStr)
	p.MCPEnabled = mcp == 1
}

func nullStr(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	return &v.String
}

func nullInt(v sql.NullInt64) *int64 {
	if !v.Valid {
		return nil
	}
	return &v.Int64
}

func strVal(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func orStr(v *string, fallback string) any {
	if v != nil {
		return *v
	}
	return fallback
}

func orPtr(v *string, fallback *string) any {
	if v != nil {
		return *v
	}
	if fallback != nil {
		return *fallback
	}
	return nil
}

func orInt(v *int64, fallback *int64) any {
	if v != nil {
		return *v
	}
	if fallback != nil {
		return *fallback
	}
	return nil
}
