package mcp

import (
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

func TestSQLProfileForCarriesRootCA(t *testing.T) {
	host, database, username, password, rootCA := "db.local", "app", "reader", "secret", "root-ca-pem"
	port := int64(15432)
	for _, kind := range []string{engines.KindPostgres, engines.KindMySQL, engines.KindMariaDB, engines.KindSQLServer} {
		profile := &store.Profile{
			Kind: kind, Host: &host, Port: &port, SSL: true, SSLCACert: &rootCA,
		}
		cp := sqlProfileFor(profile, database, username, password)
		if cp.Kind != kind || cp.Host != host || cp.Port != port || !cp.SSL || cp.SSLCACert != rootCA || cp.Database != database || cp.Username != username || cp.Password != password || !cp.HasPassword {
			t.Errorf("%s profile = %+v, want connection and TLS fields copied", kind, cp)
		}
	}
}

func TestProvisionTimeoutIs30Seconds(t *testing.T) {
	const expectedProvisionTimeout = 30 * time.Second
	if provisionTimeout != expectedProvisionTimeout {
		t.Fatalf("provision timeout = %s, want %s", provisionTimeout, expectedProvisionTimeout)
	}
}
