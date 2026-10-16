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
	SSLCACert        *string `json:"sslCaCert,omitempty"`
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
	SSLCACert        *string `json:"sslCaCert,omitempty"`
	FilePath         *string `json:"filePath,omitempty"`
	Color            *string `json:"color,omitempty"`
	ConnectionString *string `json:"connectionString,omitempty"`
}

const profileColumns = `id, name, kind, host, port, database, username, ssl,
	ssl_ca_cert, file_path, color, connection_string, mcp_enabled, created_at, updated_at`

// Field names bound into the authenticated data of encrypted profile secrets.
const (
	profilePasswordField         = "password"
	profileConnectionStringField = "connection_string"
)

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
		p, err := s.scanProfile(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) GetProfile(id string) (*Profile, error) {
	row := s.db.QueryRow(`SELECT `+profileColumns+` FROM connection_profiles WHERE id = ?`, id)
	p, err := s.scanProfileRow(row)
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
	if !password.Valid || password.String == "" {
		return "", nil
	}
	return s.decryptSecret(id, profilePasswordField, password.String)
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
	if p.SSLCACert != nil {
		cp.SSLCACert = *p.SSLCACert
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
	password, err := s.encryptOptional(id, profilePasswordField, in.Password)
	if err != nil {
		return nil, err
	}
	connStr, err := s.encryptOptional(id, profileConnectionStringField, in.ConnectionString)
	if err != nil {
		return nil, err
	}
	_, err = s.db.Exec(
		`INSERT INTO connection_profiles (id, name, kind, host, port, database, username, password,
			ssl, ssl_ca_cert, file_path, color, connection_string, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, strVal(in.Name), strVal(in.Kind), in.Host, in.Port, in.Database, in.Username,
		password, ssl, in.SSLCACert, in.FilePath, in.Color, connStr, now, now)
	if err != nil {
		return nil, err
	}
	return s.GetProfile(id)
}

// encryptOptional encrypts a present secret, passing nil through so a column
// stays NULL when the caller omitted it. (Why)
func (s *Store) encryptOptional(recordID, field string, value *string) (any, error) {
	if value == nil {
		return nil, nil
	}
	return s.encryptSecret(recordID, field, *value)
}

func (s *Store) UpdateProfile(id string, in ProfileInput) (*Profile, error) {
	existing, err := s.GetProfile(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, nil
	}
	// Read the stored password directly: it is ciphertext (or legacy plaintext)
	// and must be carried forward verbatim, never re-encrypted. (Why)
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
		if password, err = s.encryptSecret(id, profilePasswordField, *in.Password); err != nil {
			return nil, err
		}
	} else if existingPassword.Valid {
		password = existingPassword.String
	}
	// existing.ConnectionString is decrypted, so a carried-forward value must be
	// re-encrypted rather than written back as plaintext. (Why)
	connStr := any(nil)
	switch {
	case in.ConnectionString != nil:
		if connStr, err = s.encryptSecret(id, profileConnectionStringField, *in.ConnectionString); err != nil {
			return nil, err
		}
	case existing.ConnectionString != nil:
		if connStr, err = s.encryptSecret(id, profileConnectionStringField, *existing.ConnectionString); err != nil {
			return nil, err
		}
	}
	_, err = s.db.Exec(
		`UPDATE connection_profiles SET
			name = ?, kind = ?, host = ?, port = ?, database = ?, username = ?, password = ?,
			ssl = ?, ssl_ca_cert = ?, file_path = ?, color = ?, connection_string = ?, updated_at = ?
		 WHERE id = ?`,
		orStr(in.Name, existing.Name), orStr(in.Kind, existing.Kind),
		orPtr(in.Host, existing.Host), orInt(in.Port, existing.Port),
		orPtr(in.Database, existing.Database), orPtr(in.Username, existing.Username),
		password, ssl, orPtr(in.SSLCACert, existing.SSLCACert),
		orPtr(in.FilePath, existing.FilePath), orPtr(in.Color, existing.Color),
		connStr, nowISO(), id)
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
// rows readable exactly like the TS rowToProfile cast. The connection string
// is decrypted here so callers always receive the plaintext they can dial.
func (s *Store) scanProfile(rows *sql.Rows) (Profile, error) {
	var p Profile
	var id any
	var host, database, username, caCert, filePath, color, connStr sql.NullString
	var port sql.NullInt64
	var ssl, mcp int64
	err := rows.Scan(&id, &p.Name, &p.Kind, &host, &port, &database, &username,
		&ssl, &caCert, &filePath, &color, &connStr, &mcp, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return p, err
	}
	if err := s.fillProfile(&p, id, host, port, database, username, caCert, filePath, color, connStr, ssl, mcp); err != nil {
		return p, err
	}
	return p, nil
}

func (s *Store) scanProfileRow(row *sql.Row) (Profile, error) {
	var p Profile
	var id any
	var host, database, username, caCert, filePath, color, connStr sql.NullString
	var port sql.NullInt64
	var ssl, mcp int64
	err := row.Scan(&id, &p.Name, &p.Kind, &host, &port, &database, &username,
		&ssl, &caCert, &filePath, &color, &connStr, &mcp, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return p, err
	}
	if err := s.fillProfile(&p, id, host, port, database, username, caCert, filePath, color, connStr, ssl, mcp); err != nil {
		return p, err
	}
	return p, nil
}

func (s *Store) fillProfile(p *Profile, id any, host sql.NullString, port sql.NullInt64,
	database, username, caCert, filePath, color, connStr sql.NullString, ssl, mcp int64) error {
	p.ID = fmt.Sprint(id)
	p.Host = nullStr(host)
	p.Port = nullInt(port)
	p.Database = nullStr(database)
	p.Username = nullStr(username)
	p.SSL = ssl == 1
	p.SSLCACert = nullStr(caCert)
	p.FilePath = nullStr(filePath)
	p.Color = nullStr(color)
	p.MCPEnabled = mcp == 1
	p.ConnectionString = nullStr(connStr)
	if p.ConnectionString != nil && *p.ConnectionString != "" {
		decoded, err := s.decryptSecret(p.ID, profileConnectionStringField, *p.ConnectionString)
		if err != nil {
			return err
		}
		p.ConnectionString = &decoded
	}
	return nil
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
