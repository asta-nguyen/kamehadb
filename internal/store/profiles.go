package store

import (
	"database/sql"
	"fmt"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/logs"
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
		// Listing tolerates an unreadable secret: a locked or reset keychain
		// must not turn the whole workspace into an empty list. (Why)
		p, err := s.scanProfile(rows, true)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) GetProfile(id string) (*Profile, error) {
	return s.getProfile(id, false)
}

// GetProfileLenient reads a profile and ignores an unreadable connection string
// so update and edit workflows can repair broken credentials. (Why)
func (s *Store) GetProfileLenient(id string) (*Profile, error) {
	return s.getProfile(id, true)
}

func (s *Store) getProfile(id string, lenient bool) (*Profile, error) {
	row := s.db.QueryRow(`SELECT `+profileColumns+` FROM connection_profiles WHERE id = ?`, id)
	p, err := s.scanProfile(row, lenient)
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
	// Read stored profile and raw credentials directly: they are ciphertext
	// (or legacy plaintext) and must be carried forward verbatim when omitted,
	// never re-encrypted. Skipping decryption here also prevents spurious
	// unreadable-secret warnings during non-secret metadata updates. (What / Why)
	var (
		curName, curKind string
		curHost, curDB   sql.NullString
		curPort          sql.NullInt64
		curUser          sql.NullString
		curPassword      sql.NullString
		curSSL           int64
		curSSLCACert     sql.NullString
		curFilePath      sql.NullString
		curColor         sql.NullString
		curConnStr       sql.NullString
	)
	err := s.db.QueryRow(`
		SELECT name, kind, host, port, database, username, password,
		       ssl, ssl_ca_cert, file_path, color, connection_string
		FROM connection_profiles WHERE id = ?`, id,
	).Scan(
		&curName, &curKind, &curHost, &curPort, &curDB, &curUser, &curPassword,
		&curSSL, &curSSLCACert, &curFilePath, &curColor, &curConnStr,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	ssl := int64(0)
	switch {
	case in.SSL != nil && *in.SSL:
		ssl = 1
	case in.SSL == nil && curSSL == 1:
		ssl = 1
	}
	password := any(nil)
	if in.Password != nil {
		if password, err = s.encryptSecret(id, profilePasswordField, *in.Password); err != nil {
			return nil, err
		}
	} else if curPassword.Valid {
		password = curPassword.String
	}
	connStr := any(nil)
	if in.ConnectionString != nil {
		if connStr, err = s.encryptSecret(id, profileConnectionStringField, *in.ConnectionString); err != nil {
			return nil, err
		}
	} else if curConnStr.Valid {
		connStr = curConnStr.String
	}
	_, err = s.db.Exec(
		`UPDATE connection_profiles SET
			name = ?, kind = ?, host = ?, port = ?, database = ?, username = ?, password = ?,
			ssl = ?, ssl_ca_cert = ?, file_path = ?, color = ?, connection_string = ?, updated_at = ?
		 WHERE id = ?`,
		orStr(in.Name, curName), orStr(in.Kind, curKind),
		orPtr(in.Host, nullStr(curHost)), orInt(in.Port, nullInt(curPort)),
		orPtr(in.Database, nullStr(curDB)), orPtr(in.Username, nullStr(curUser)),
		password, ssl, orPtr(in.SSLCACert, nullStr(curSSLCACert)),
		orPtr(in.FilePath, nullStr(curFilePath)), orPtr(in.Color, nullStr(curColor)),
		connStr, nowISO(), id)
	if err != nil {
		return nil, err
	}
	return s.GetProfileLenient(id)
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
// lenient (listing) drops a field it cannot decrypt instead of failing.
func (s *Store) scanProfile(row interface{ Scan(...any) error }, lenient bool) (Profile, error) {
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
	if err := s.fillProfile(&p, id, host, port, database, username, caCert, filePath, color, connStr, ssl, mcp, lenient); err != nil {
		return p, err
	}
	return p, nil
}

func (s *Store) fillProfile(p *Profile, id any, host sql.NullString, port sql.NullInt64,
	database, username, caCert, filePath, color, connStr sql.NullString, ssl, mcp int64, lenient bool,
) error {
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
			if !lenient {
				return err
			}
			// The profile is still useful without this field; log it so the
			// failure is diagnosable instead of silently blanking the form. (Why)
			logs.Warn("store", "connection string for profile "+p.Name+" could not be read: "+err.Error())
			p.ConnectionString = nil
			return nil
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
