package engines

// ConnProfile is the flat connect contract factories consume — the adapter
// config objects the TS factory builds per kind, unified into one struct.
type ConnProfile struct {
	Kind     string
	Host     string
	Port     int64
	Database string
	Username string
	Password string
	// HasPassword mirrors the TS undefined-vs-empty distinction: an empty
	// stored password is still a saved password.
	HasPassword      bool
	SSL              bool
	SSLCACert        string
	FilePath         string
	ConnectionString string
}
