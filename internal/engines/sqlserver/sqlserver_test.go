package sqlserver

import (
	"encoding/pem"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/microsoft/go-mssqldb/msdsn"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

func TestOpenDBTLS(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer server.Close()
	caPEM := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw}))

	cp := engines.ConnProfile{Host: "db.local", Database: "app", Username: "user", Password: "pass", SSL: true}
	unverified, err := tlsConnectionConfig(cp, connectTimeout)
	if err != nil || unverified.Encryption != msdsn.EncryptionRequired || unverified.TLSConfig == nil || !unverified.TLSConfig.InsecureSkipVerify || unverified.TLSConfig.ServerName != cp.Host {
		t.Fatalf("SSL config without PEM = (%+v, %v), want required encrypted skip-verify", unverified, err)
	}

	cp.SSLCACert = caPEM
	verified, err := tlsConnectionConfig(cp, connectTimeout)
	if err != nil || verified.TLSConfig == nil || verified.TLSConfig.RootCAs == nil || verified.TLSConfig.ServerName != cp.Host || verified.TLSConfig.InsecureSkipVerify {
		t.Fatalf("SSL config with PEM = (%+v, %v), want custom roots and hostname verification", verified, err)
	}
	db, err := OpenDB(cp, connectTimeout)
	if err != nil {
		t.Fatalf("OpenDB with SSL = %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	cp.SSLCACert = "not a certificate"
	if _, err := tlsConnectionConfig(cp, connectTimeout); err == nil {
		t.Fatal("invalid Root CA PEM should fail before opening a connection")
	}
}

func TestOpenDBPreservesConnectionTimeout(t *testing.T) {
	const provisionTimeout = 30 * time.Second
	cp := engines.ConnProfile{Host: "db.local", Database: "app", Username: "user", Password: "pass", SSL: true}
	config, err := tlsConnectionConfig(cp, provisionTimeout)
	if err != nil || config.ConnTimeout != provisionTimeout {
		t.Fatalf("parsed connection timeout = (%v, %v), want %v", config.ConnTimeout, err, provisionTimeout)
	}

	cp.SSL = false
	want := fmt.Sprintf("sqlserver://user:pass@db.local:%d?connection+timeout=%d&database=app",
		engines.DefaultPorts[engines.KindSQLServer], int64(connectTimeout/time.Second))
	if got := dsn(cp, connectTimeout); got != want {
		t.Fatalf("SSL-off DSN = %q, want existing format %q", got, want)
	}
	db, err := OpenDB(cp, connectTimeout)
	if err != nil {
		t.Fatalf("OpenDB without SSL = %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
}
