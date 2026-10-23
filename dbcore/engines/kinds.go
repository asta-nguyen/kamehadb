package engines

// Live database kinds supported by the provider core. The literal values are
// contract: app persistence CHECK constraints bake them into table DDL.
const (
	KindPostgres   = "postgres"
	KindSQLite     = "sqlite"
	KindMySQL      = "mysql"
	KindRedis      = "redis"
	KindMongoDB    = "mongodb"
	KindSQLServer  = "sqlserver"
	KindOracle     = "oracle"
	KindClickHouse = "clickhouse"
	KindMariaDB    = "mariadb"
	KindDuckDB     = "duckdb"
)

// AllKinds is the ten-engine inventory this core can register providers for.
// The app's legacy-inclusive list lives in internal/engines.
var AllKinds = []string{
	KindPostgres, KindSQLite, KindMySQL, KindRedis, KindMongoDB,
	KindSQLServer, KindOracle, KindClickHouse, KindMariaDB, KindDuckDB,
}

// SQLKinds route through the SQLAdapter capability.
var SQLKinds = []string{
	KindPostgres, KindMySQL, KindSQLite, KindSQLServer, KindOracle,
	KindClickHouse, KindMariaDB, KindDuckDB,
}

// NoSQLKinds have dedicated adapters.
var NoSQLKinds = []string{KindRedis, KindMongoDB}

// FileDatabaseKinds connect via file path instead of host/port.
var FileDatabaseKinds = []string{KindSQLite, KindDuckDB}

// PasswordRequiredKinds reject connect attempts without a saved password.
var PasswordRequiredKinds = []string{
	KindPostgres, KindMySQL, KindMariaDB, KindSQLServer, KindOracle,
}

// UsernameRequiredKinds need an explicit username (others have defaults).
var UsernameRequiredKinds = []string{KindPostgres, KindMySQL, KindMariaDB}

// DefaultPorts per live kind (0 = not networked). Callers needing legacy
// ports copy this map instead of mutating it.
var DefaultPorts = map[string]int{
	KindPostgres:   5432,
	KindMySQL:      3306,
	KindSQLite:     0,
	KindRedis:      6379,
	KindMongoDB:    27017,
	KindSQLServer:  1433,
	KindOracle:     1521,
	KindClickHouse: 8123,
	KindMariaDB:    3306,
	KindDuckDB:     0,
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
