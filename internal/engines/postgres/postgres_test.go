package postgres

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

// pgTLSConfig must verify the server chain and the configured host name, while
// rejecting an unknown root and a name mismatch. A test-only root pool models
// a private CA without requiring one. (What / Why)
func TestPGTLSConfigVerifiesServer(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	addr := server.Listener.Addr().String()
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}

	trusted := x509.NewCertPool()
	trusted.AddCert(server.Certificate())

	dial := func(cfg *tls.Config) error {
		conn, err := tls.Dial("tcp", addr, cfg)
		if err != nil {
			return err
		}
		return conn.Close()
	}

	if err := dial(pgTLSConfig(host, trusted)); err != nil {
		t.Fatalf("trusted certificate + matching host should succeed: %v", err)
	}
	if err := dial(pgTLSConfig(host, x509.NewCertPool())); err == nil {
		t.Fatal("unknown root should fail the handshake")
	}
	if err := dial(pgTLSConfig("mismatch.example", trusted)); err == nil {
		t.Fatal("host-name mismatch should fail the handshake")
	}
}

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

func TestSplitTableID(t *testing.T) {
	if s, tb := splitTableID("public.users"); s != "public" || tb != "users" {
		t.Errorf("basic: %s.%s", s, tb)
	}
	// TS split('.') ignores parts after the second.
	if s, tb := splitTableID("a.b.c"); s != "a" || tb != "b" {
		t.Errorf("three-part: %s.%s", s, tb)
	}
	if s, tb := splitTableID("noschema"); s != "noschema" || tb != "" {
		t.Errorf("single: %s.%s", s, tb)
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

type fakeLoader struct{ cp engines.ConnProfile }

func (f fakeLoader) ProfileForConnect(id string) (engines.ConnProfile, error) { return f.cp, nil }
