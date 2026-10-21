package postgres

import (
	"context"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

func TestValidation(t *testing.T) {
	cases := []struct {
		name string
		cp   engines.ConnProfile
		want string
	}{
		{"no database", engines.ConnProfile{Username: "u", HasPassword: true}, "Database name is required"},
		{"no username", engines.ConnProfile{Database: "d", HasPassword: true}, "Username is required"},
		{"no password", engines.ConnProfile{Database: "d", Username: "u"}, "Password is required"},
	}
	for _, c := range cases {
		if _, err := New(c.cp); err == nil || err.Error() != c.want {
			t.Errorf("%s: want %q, got %v", c.name, c.want, err)
		}
	}
	// Empty-string password is still a password (TS checks undefined only).
	a, err := New(engines.ConnProfile{Database: "d", Username: "u", Password: "", HasPassword: true})
	if err != nil {
		t.Fatalf("empty password should pass validation: %v", err)
	}
	a.Close()
}

func TestNewAdapterRejectsInvalidRootCA(t *testing.T) {
	_, err := New(engines.ConnProfile{
		Host: "invalid.invalid", Database: "db", Username: "user", HasPassword: true,
		SSL: true, SSLCACert: "not a certificate",
	})
	if err == nil || err.Error() != "invalid Root CA PEM" {
		t.Fatalf("New error = %v, want invalid PEM before dialing", err)
	}
}

func TestNewNotifyConnRejectsInvalidRootCA(t *testing.T) {
	_, err := NewNotifyConn(context.Background(), engines.ConnProfile{
		Host: "invalid.invalid", SSL: true, SSLCACert: "not a certificate",
	})
	if err == nil || err.Error() != "invalid Root CA PEM" {
		t.Fatalf("NewNotifyConn error = %v, want invalid PEM before dialing", err)
	}
}

func TestPostgresConnectionRejectsInvalidRootCA(t *testing.T) {
	_, err := TestPostgresConnection(context.Background(), engines.ConnProfile{
		Host: "invalid.invalid", SSL: true, SSLCACert: "not a certificate",
	})
	if err == nil || err.Error() != "invalid Root CA PEM" {
		t.Fatalf("TestPostgresConnection error = %v, want invalid PEM before dialing", err)
	}
}

func TestConfigurePostgresTLSWithoutRootCA(t *testing.T) {
	cfg, err := pgx.ParseConfig("")
	if err != nil {
		t.Fatal(err)
	}
	cfg.Fallbacks = []*pgconn.FallbackConfig{{Host: "fallback.local"}}
	if err := configurePostgresTLS(cfg, engines.ConnProfile{SSL: true}, "db.local"); err != nil {
		t.Fatal(err)
	}
	if cfg.TLSConfig == nil || cfg.TLSConfig.ServerName != "db.local" || !cfg.TLSConfig.InsecureSkipVerify {
		t.Fatalf("TLS config = %+v, want encrypted TLS without certificate verification", cfg.TLSConfig)
	}
	if len(cfg.Fallbacks) != 0 {
		t.Fatalf("TLS fallback count = %d, want none", len(cfg.Fallbacks))
	}
}

func TestSplitTableID(t *testing.T) {
	if s, tb := splitTableID("public.users"); s != "public" || tb != "users" {
		t.Errorf("basic: %s.%s", s, tb)
	}
	// TS split('.') ignores parts after the second.
	if s, tb := splitTableID("a.b.c"); s != "a" || tb != "b" {
		t.Errorf("three-part: %s.%s", s, tb)
	}
	if s, tb := splitTableID("noschema"); s != "public" || tb != "noschema" {
		t.Errorf("single: want public.noschema, got %s.%s", s, tb)
	}
}

func TestNormalizeValue(t *testing.T) {
	ts := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	if got := normalizeValue(nil, ts); got != "2026-01-02T03:04:05Z" {
		t.Errorf("time: %v", got)
	}
	if got := normalizeValue(nil, nil); got != nil {
		t.Errorf("nil: %v", got)
	}
	n := pgtype.Numeric{Int: big.NewInt(12345), Exp: -2, Valid: true}
	if got := normalizeValue(nil, n); got != "123.45" {
		t.Errorf("numeric: %v (%T)", got, got)
	}
	u := pgtype.UUID{Bytes: [16]byte{0xde, 0xad, 0xbe, 0xef}, Valid: true}
	got := normalizeValue(nil, u)
	if s, ok := got.(string); !ok || len(s) != 36 {
		t.Errorf("uuid: %v", got)
	}
	// jsonb decodes to a Go value.
	f := &pgconn.FieldDescription{Name: "j", DataTypeOID: 3802}
	if got := normalizeValue(f, []byte(`{"a":1}`)); got == nil {
		t.Error("jsonb unmarshal failed")
	} else if m, ok := got.(map[string]any); !ok || m["a"] != float64(1) {
		t.Errorf("jsonb value: %v", got)
	}
}

func TestRowsToMapsDuplicateColumns(t *testing.T) {
	c := &collected{
		fields: []pgconn.FieldDescription{{Name: "x"}, {Name: "x"}},
		rows:   [][]any{{"first", "last"}},
	}
	m := rowsToMaps(c)
	if m[0]["x"] != "last" {
		t.Errorf("dup column should collapse to last value: %v", m[0])
	}
}

func TestFactoryRegistered(t *testing.T) {
	// init() must have registered the postgres factory.
	reg := engines.NewRegistry(fakeLoader{cp: engines.ConnProfile{
		Kind: engines.KindPostgres, Database: "d", Username: "u", HasPassword: true, Password: "p",
	}})
	a, err := reg.Get(context.Background(), "c1")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := a.(*Adapter); !ok {
		t.Fatalf("expected *Adapter, got %T", a)
	}
	reg.Close()
}

func TestParseIndexStatsRowsAndUsage(t *testing.T) {
	// Verify the SQL query explicitly joins pg_stat_all_indexes and selects telemetry columns
	// to prevent regressions where scans/reads are dropped from the query. (How / Why / What)
	for _, expectedToken := range []string{"pg_stat_all_indexes", "COALESCE(s.idx_scan, 0)", "COALESCE(s.idx_tup_read, 0)"} {
		if !strings.Contains(indexStatsSQL, expectedToken) {
			t.Errorf("indexStatsSQL missing required token %q", expectedToken)
		}
	}

	// Mock query result rows with multi-column index and telemetry values:
	// row: name, table_name, column_name, unique, primary, method, size_bytes, scans, reads
	rows := [][]any{
		{"large_pkey", "large", "id", true, true, "btree", int64(16384), int64(29), int64(58)},
		{"large_idx_ab", "large", "col_a", false, false, "btree", int64(8192), int64(0), int64(0)},
		{"large_idx_ab", "large", "col_b", false, false, "btree", int64(8192), int64(0), int64(0)}, // composite column
	}

	stats := parseIndexStatsRows(rows)
	if len(stats) != 2 {
		t.Fatalf("expected 2 index entries (composite collapsed), got %d", len(stats))
	}

	// large_pkey check
	pk := stats[0]
	if pk.Name != "large_pkey" || !pk.Primary || !pk.Unique {
		t.Errorf("unexpected pk attributes: %+v", pk)
	}
	if pk.Scans != 29 || pk.Reads != 58 || pk.SizeBytes != 16384 {
		t.Errorf("unexpected pk telemetry: Scans=%d Reads=%d SizeBytes=%d", pk.Scans, pk.Reads, pk.SizeBytes)
	}
	if pk.UsagePercent != 100.0 {
		t.Errorf("pk UsagePercent = %v, want 100.0", pk.UsagePercent)
	}
	if len(pk.Columns) != 1 || pk.Columns[0] != "id" {
		t.Errorf("pk Columns = %v, want ['id']", pk.Columns)
	}

	// composite large_idx_ab check
	comp := stats[1]
	if comp.Name != "large_idx_ab" || comp.Primary || comp.Unique {
		t.Errorf("unexpected composite index attributes: %+v", comp)
	}
	if comp.Scans != 0 || comp.UsagePercent != 0.0 {
		t.Errorf("composite Scans=%d UsagePercent=%v", comp.Scans, comp.UsagePercent)
	}
	if len(comp.Columns) != 2 || comp.Columns[0] != "col_a" || comp.Columns[1] != "col_b" {
		t.Errorf("composite Columns = %v, want ['col_a', 'col_b']", comp.Columns)
	}
}

type fakeLoader struct{ cp engines.ConnProfile }

func (f fakeLoader) ProfileForConnect(id string) (engines.ConnProfile, error) { return f.cp, nil }
