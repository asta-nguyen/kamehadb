package mysql

import (
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

func TestNewValidation(t *testing.T) {
	if _, err := New(engines.ConnProfile{Kind: engines.KindMySQL}); err == nil || err.Error() != "Database name is required" {
		t.Fatalf("want database error, got %v", err)
	}
	if _, err := New(engines.ConnProfile{Kind: engines.KindMySQL, Database: "d"}); err == nil || err.Error() != "Username is required" {
		t.Fatalf("want username error, got %v", err)
	}
	if _, err := New(engines.ConnProfile{Kind: engines.KindMySQL, Database: "d", Username: "u"}); err == nil || err.Error() != "Password is required" {
		t.Fatalf("want password error, got %v", err)
	}
	a, err := New(engines.ConnProfile{Kind: engines.KindMySQL, Database: "d", Username: "u", HasPassword: true})
	if err != nil {
		t.Fatalf("empty-but-present password should be accepted: %v", err)
	}
	defer a.Close()
	if a.isMariaDB {
		t.Fatal("mysql kind must not be mariaDB")
	}
}

func TestMariaDBFlag(t *testing.T) {
	a, err := New(engines.ConnProfile{Kind: engines.KindMariaDB, Database: "d", Username: "u", HasPassword: true})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if !a.isMariaDB {
		t.Fatal("mariadb kind must set isMariaDB")
	}
}

func TestSplitTableID(t *testing.T) {
	if s, tb := splitTableID("db", "sch.tbl"); s != "sch" || tb != "tbl" {
		t.Fatalf("got %q %q", s, tb)
	}
	if s, tb := splitTableID("db", "tbl"); s != "db" || tb != "tbl" {
		t.Fatalf("got %q %q", s, tb)
	}
	if s, tb := splitTableID("db", "a.b.c"); s != "a" || tb != "b" {
		t.Fatalf("TS drops extra segments: got %q %q", s, tb)
	}
}

func TestTimeoutWeakenHint(t *testing.T) {
	if !timeoutWeakenRe.MatchString("SELECT /*+ SET_VAR(max_execution_time=1) */ 1") {
		t.Fatal("should reject set_var max_execution_time hint")
	}
	if timeoutWeakenRe.MatchString("SELECT 1") {
		t.Fatal("plain select must pass")
	}
}

func TestEsc(t *testing.T) {
	a := &Adapter{}
	if got := a.esc("we`ird"); got != "`we``ird`" {
		t.Fatalf("got %q", got)
	}
}

func TestOpenDBTLSConfig(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer server.Close()
	caPEM := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw}))

	plain, err := driverConfig(engines.ConnProfile{Host: "db.local"})
	if err != nil || plain.TLS != nil {
		t.Fatalf("SSL-off config = (%+v, %v), want no TLS", plain, err)
	}

	unverified, err := driverConfig(engines.ConnProfile{Host: "db.local", SSL: true})
	if err != nil || unverified.TLS == nil || !unverified.TLS.InsecureSkipVerify {
		t.Fatalf("SSL config without PEM = (%+v, %v), want skip-verify", unverified, err)
	}

	verified, err := driverConfig(engines.ConnProfile{Host: "db.local", SSL: true, SSLCACert: caPEM})
	if err != nil || verified.TLS == nil || verified.TLS.RootCAs == nil || verified.TLS.ServerName != "db.local" {
		t.Fatalf("SSL config with PEM = (%+v, %v), want profile CA and hostname", verified, err)
	}

	if _, err := driverConfig(engines.ConnProfile{SSL: true, SSLCACert: "not a certificate"}); err == nil {
		t.Fatal("invalid Root CA PEM should fail before opening a connection")
	}
}
