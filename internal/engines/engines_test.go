package engines

import (
	"testing"

	db "github.com/asta-nguyen/kamehadb/dbcore/engines"
)

func TestKindHelpers(t *testing.T) {
	if !db.IsSQLKind(db.KindPostgres) || !db.IsSQLKind(db.KindDuckDB) {
		t.Error("sql kinds")
	}
	if db.IsSQLKind(db.KindMongoDB) || db.IsSQLKind(db.KindRedis) {
		t.Error("non-sql leaked into SQLKinds")
	}
	if !db.IsNoSQLKind(db.KindRedis) || db.IsNoSQLKind(KindQdrant) {
		t.Error("nosql kinds")
	}
	if !IsValidKind(KindTigerBeetle) || IsValidKind("bogus") {
		t.Error("valid kind check")
	}
	if !db.IsFileDatabaseKind(db.KindSQLite) || db.IsFileDatabaseKind(db.KindPostgres) {
		t.Error("file kinds")
	}
	if !db.IsPasswordRequired(db.KindOracle) || db.IsPasswordRequired(db.KindSQLite) {
		t.Error("password-required")
	}
	if IsMCPServerKind(db.KindSQLite) || !IsMCPSupportedKind(db.KindSQLite) {
		t.Error("sqlite is mcp-supported but not server-kind")
	}
	if DefaultPorts[db.KindPostgres] != 5432 || DefaultPorts[db.KindMySQL] != 3306 {
		t.Error("ports")
	}
}

func TestAppKindInventoryCompatibility(t *testing.T) {
	// Legacy CHECK order: legacy kinds keep their persisted positions.
	want := []string{
		"postgres", "sqlite", "mysql", "redis", "mongodb", "qdrant",
		"sqlserver", "oracle", "clickhouse", "mariadb", "duckdb", "tigerbeetle",
	}
	if len(AllKinds) != len(want) {
		t.Fatalf("AllKinds: %d", len(AllKinds))
	}
	for i, k := range want {
		if AllKinds[i] != k {
			t.Fatalf("AllKinds[%d]=%s want %s", i, AllKinds[i], k)
		}
	}
	if !IsMCPSupportedKind("sqlite") || IsMCPServerKind("sqlite") {
		t.Error("sqlite mcp supported but not server")
	}
	// Live ports match the public map; adding legacy entries must not mutate it.
	for k, p := range db.DefaultPorts {
		if DefaultPorts[k] != p {
			t.Errorf("app port for %s diverges: %d", k, DefaultPorts[k])
		}
	}
	if _, leaked := db.DefaultPorts[KindQdrant]; leaked {
		t.Error("legacy qdrant port leaked into public map")
	}
	if DefaultPorts[KindQdrant] != 6333 || DefaultPorts[KindTigerBeetle] != 3001 {
		t.Error("legacy ports missing")
	}
}
