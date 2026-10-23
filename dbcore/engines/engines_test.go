package engines

import (
	"testing"
)

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
