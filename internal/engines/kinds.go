package engines

// Database kinds as stored in connection_profiles.kind. The literal values
// are contract: legacy CHECK constraints bake them into table DDL and the
// migration sequence inspects that DDL text.
const (
	KindPostgres    = "postgres"
	KindSQLite      = "sqlite"
	KindMySQL       = "mysql"
	KindRedis       = "redis"
	KindMongoDB     = "mongodb"
	KindQdrant      = "qdrant"
	KindSQLServer   = "sqlserver"
	KindOracle      = "oracle"
	KindClickHouse  = "clickhouse"
	KindMariaDB     = "mariadb"
	KindDuckDB      = "duckdb"
	KindTigerBeetle = "tigerbeetle"
)

// AllKinds is the persisted CHECK list in DDL order. Dropped engines stay
// listed so existing databases migrate identically to the TS implementation.
var AllKinds = []string{
	KindPostgres, KindSQLite, KindMySQL, KindRedis, KindMongoDB, KindQdrant,
	KindSQLServer, KindOracle, KindClickHouse, KindMariaDB, KindDuckDB,
	KindTigerBeetle,
}

// MCPServerKinds are the network databases eligible for a managed read-only
// account (MCP_SUPPORTED_KINDS minus SQLite).
var MCPServerKinds = []string{
	KindPostgres, KindMySQL, KindMariaDB, KindSQLServer, KindMongoDB,
}

// MCPSupportedKinds can be exposed through the read-only MCP listener.
var MCPSupportedKinds = []string{
	KindPostgres, KindMySQL, KindMariaDB, KindSQLite, KindSQLServer, KindMongoDB,
}

// SQLKinds route through the SqlAdapter path.
var SQLKinds = []string{
	KindPostgres, KindMySQL, KindSQLite, KindSQLServer, KindOracle,
	KindClickHouse, KindMariaDB, KindDuckDB,
}

// NoSQLKinds have dedicated adapters — only live kinds (legacy qdrant /
// tigerbeetle profiles fall through to unsupported).
var NoSQLKinds = []string{KindRedis, KindMongoDB}

// FileDatabaseKinds connect via file path instead of host/port.
var FileDatabaseKinds = []string{KindSQLite, KindDuckDB}

// PasswordRequiredKinds reject connect attempts without a saved password.
var PasswordRequiredKinds = []string{
	KindPostgres, KindMySQL, KindMariaDB, KindSQLServer, KindOracle,
}

// UsernameRequiredKinds need an explicit username (others have defaults).
var UsernameRequiredKinds = []string{KindPostgres, KindMySQL, KindMariaDB}

// DefaultPorts per kind (0 = not networked); legacy kinds stay so old
// profiles still resolve their display port.
var DefaultPorts = map[string]int{
	KindPostgres:    5432,
	KindMySQL:       3306,
	KindSQLite:      0,
	KindRedis:       6379,
	KindMongoDB:     27017,
	KindQdrant:      6333,
	KindSQLServer:   1433,
	KindOracle:      1521,
	KindClickHouse:  8123,
	KindMariaDB:     3306,
	KindDuckDB:      0,
	KindTigerBeetle: 3001,
}

func inKinds(list []string, kind string) bool {
	for _, k := range list {
		if k == kind {
			return true
		}
	}
	return false
}

func IsValidKind(kind string) bool        { return inKinds(AllKinds, kind) }
func IsSQLKind(kind string) bool          { return inKinds(SQLKinds, kind) }
func IsNoSQLKind(kind string) bool        { return inKinds(NoSQLKinds, kind) }
func IsFileDatabaseKind(kind string) bool { return inKinds(FileDatabaseKinds, kind) }
func IsPasswordRequired(kind string) bool { return inKinds(PasswordRequiredKinds, kind) }
func IsUsernameRequired(kind string) bool { return inKinds(UsernameRequiredKinds, kind) }
func IsMCPSupportedKind(kind string) bool { return inKinds(MCPSupportedKinds, kind) }
func IsMCPServerKind(kind string) bool    { return inKinds(MCPServerKinds, kind) }
