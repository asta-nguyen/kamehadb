package engines

import db "github.com/asta-nguyen/kamehadb/dbcore/engines"

// Database kinds as stored in connection_profiles.kind. The ten live kind
// literals come from dbcore/engines; only the dropped legacy kinds remain
// declared here. The literal values are contract: legacy CHECK constraints
// bake them into table DDL and the migration sequence inspects that DDL text.
const (
	KindQdrant      = "qdrant"
	KindTigerBeetle = "tigerbeetle"
)

// AllKinds is the persisted CHECK list in DDL order. Dropped engines stay
// listed so existing databases migrate identically to the TS implementation.
var AllKinds = []string{
	db.KindPostgres, db.KindSQLite, db.KindMySQL, db.KindRedis, db.KindMongoDB, KindQdrant,
	db.KindSQLServer, db.KindOracle, db.KindClickHouse, db.KindMariaDB, db.KindDuckDB,
	KindTigerBeetle,
}

// MCPServerKinds are the network databases eligible for a managed read-only
// account (MCP_SUPPORTED_KINDS minus SQLite).
var MCPServerKinds = []string{
	db.KindPostgres, db.KindMySQL, db.KindMariaDB, db.KindSQLServer, db.KindMongoDB,
}

// MCPSupportedKinds can be exposed through the read-only MCP listener.
var MCPSupportedKinds = []string{
	db.KindPostgres, db.KindMySQL, db.KindMariaDB, db.KindSQLite, db.KindSQLServer, db.KindMongoDB,
}

// DefaultPorts per kind (0 = not networked). The public live map is copied
// so legacy entries can be added without mutating dbcore's map.
var DefaultPorts = func() map[string]int {
	m := make(map[string]int, len(db.DefaultPorts)+2)
	for k, v := range db.DefaultPorts {
		m[k] = v
	}
	m[KindQdrant] = 6333
	m[KindTigerBeetle] = 3001
	return m
}()

func IsValidKind(kind string) bool {
	for _, k := range AllKinds {
		if k == kind {
			return true
		}
	}
	return false
}

func IsMCPSupportedKind(kind string) bool { return inList(MCPSupportedKinds, kind) }
func IsMCPServerKind(kind string) bool    { return inList(MCPServerKinds, kind) }

func inList(list []string, kind string) bool {
	for _, k := range list {
		if k == kind {
			return true
		}
	}
	return false
}
