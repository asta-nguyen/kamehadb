package engines

import (
	"context"
	"errors"
	"testing"
)

func TestKindHelpers(t *testing.T) {
	if !IsSQLKind(KindPostgres) || !IsSQLKind(KindDuckDB) {
		t.Error("sql kinds")
	}
	if IsSQLKind(KindMongoDB) || IsSQLKind(KindRedis) {
		t.Error("non-sql leaked into SQLKinds")
	}
	if !IsNoSQLKind(KindRedis) || IsNoSQLKind(KindQdrant) {
		t.Error("nosql kinds")
	}
	if !IsValidKind(KindTigerBeetle) || IsValidKind("bogus") {
		t.Error("valid kind check")
	}
	if !IsFileDatabaseKind(KindSQLite) || IsFileDatabaseKind(KindPostgres) {
		t.Error("file kinds")
	}
	if !IsPasswordRequired(KindOracle) || IsPasswordRequired(KindSQLite) {
		t.Error("password-required")
	}
	if IsMCPServerKind(KindSQLite) || !IsMCPSupportedKind(KindSQLite) {
		t.Error("sqlite is mcp-supported but not server-kind")
	}
	if DefaultPorts[KindPostgres] != 5432 || DefaultPorts[KindMySQL] != 3306 {
		t.Error("ports")
	}
}

func TestQuoteIdentifier(t *testing.T) {
	if got := QuoteIdentifier(KindPostgres, `we"ird`); got != `"we""ird"` {
		t.Errorf("pg: %s", got)
	}
	if got := QuoteIdentifier(KindMySQL, "my`col"); got != "`my``col`" {
		t.Errorf("mysql: %s", got)
	}
	if got := QuoteIdentifier(KindSQLServer, "a]b"); got != "[a]]b]" {
		t.Errorf("mssql: %s", got)
	}
	if got := QuoteIdentifier(KindSQLite, "t"); got != `"t"` {
		t.Errorf("sqlite: %s", got)
	}
}

type fakeLoader struct{ cp ConnProfile }

func (f fakeLoader) ProfileForConnect(id string) (ConnProfile, error) {
	if f.cp.Kind == "" {
		return ConnProfile{}, ErrConnectionNotFound
	}
	return f.cp, nil
}

type fakeAdapter struct {
	id     int
	closed *bool
}

func (a fakeAdapter) TestConnection(ctx context.Context) (*TestConnectionResult, error) {
	return &TestConnectionResult{Success: true}, nil
}

func (a fakeAdapter) ListDatabases(ctx context.Context) ([]DatabaseInfo, error) {
	return nil, nil
}

func (a fakeAdapter) ListSchemas(ctx context.Context, d *string) ([]SchemaInfo, error) {
	return nil, nil
}

func (a fakeAdapter) ListTables(ctx context.Context, s *string) ([]TableInfo, error) {
	return nil, nil
}

func (a fakeAdapter) GetTableColumns(ctx context.Context, t string) ([]ColumnInfo, error) {
	return nil, nil
}

func (a fakeAdapter) GetTableIndexes(ctx context.Context, t string) ([]IndexInfo, error) {
	return nil, nil
}

func (a fakeAdapter) GetCompletions(ctx context.Context, s *string) ([]TableCompletions, error) {
	return nil, nil
}

func (a fakeAdapter) PreviewRows(ctx context.Context, i PreviewRowsInput) (*QueryResult, error) {
	return nil, nil
}

func (a fakeAdapter) RunQuery(ctx context.Context, i RunQueryInput) (*QueryResult, error) {
	return nil, nil
}

func (a fakeAdapter) Close() error {
	if a.closed != nil {
		*a.closed = true
	}
	return nil
}

func TestRegistry(t *testing.T) {
	ctx := context.Background()
	var seq int
	RegisterFactory("fake-seq", func(cp ConnProfile) (SQLAdapter, error) {
		seq++
		return fakeAdapter{id: seq}, nil
	})
	defer func() {
		factoriesMu.Lock()
		delete(factories, "fake-seq")
		factoriesMu.Unlock()
	}()

	reg := NewRegistry(fakeLoader{cp: ConnProfile{Kind: "fake-seq"}})
	a1, err := reg.Get(ctx, "c1")
	if err != nil {
		t.Fatal(err)
	}
	a2, _ := reg.Get(ctx, "c1")
	if a1 != a2 {
		t.Error("expected cached adapter")
	}
	reg.Invalidate("c1")
	a3, _ := reg.Get(ctx, "c1")
	if a3 == a1 {
		t.Error("invalidate should drop cached adapter")
	}

	// Kind gates mirror getSqlAdapter.
	regMongo := NewRegistry(fakeLoader{cp: ConnProfile{Kind: KindMongoDB}})
	if _, err := regMongo.Get(ctx, "c"); err == nil || err.Error() != "Use /mongo endpoint for MongoDB connections" {
		t.Errorf("mongo gate: %v", err)
	}
	regTB := NewRegistry(fakeLoader{cp: ConnProfile{Kind: KindTigerBeetle}})
	if _, err := regTB.Get(ctx, "c"); err == nil || err.Error() != "TigerBeetle is not a SQL database" {
		t.Errorf("tb gate: %v", err)
	}
	regPW := NewRegistry(fakeLoader{cp: ConnProfile{Kind: KindOracle}})
	if _, err := regPW.Get(ctx, "c"); err == nil || err.Error() != "Password not saved. Open connection settings and save with password." {
		t.Errorf("password gate: %v", err)
	}

	// Unknown kind → cached UnsupportedAdapter.
	regUnk := NewRegistry(fakeLoader{cp: ConnProfile{Kind: "weird", Password: "x"}})
	a, err := regUnk.Get(ctx, "c")
	if err != nil {
		t.Fatal(err)
	}
	res, _ := a.TestConnection(ctx)
	if res.Success || res.Message != "Unsupported for weird" {
		t.Errorf("fallback testConnection: %+v", res)
	}
	if _, err := a.RunQuery(ctx, RunQueryInput{}); !errors.Is(err, errNotSupported) {
		t.Errorf("fallback runQuery: %v", err)
	}
	if a2, _ := regUnk.Get(ctx, "c"); a2 != a {
		t.Error("fallback should be cached too")
	}

	// Missing profile propagates loader error.
	regMissing := NewRegistry(fakeLoader{})
	if _, err := regMissing.Get(ctx, "nope"); !errors.Is(err, ErrConnectionNotFound) {
		t.Errorf("missing: %v", err)
	}
}
