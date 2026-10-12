package api

import "testing"

// Reads and writes must derive cache keys through the same function, so a
// table-scoped entry is read back under its table key and a connection-level
// entry cannot shadow it. (Why)
func TestSchemaCacheKey(t *testing.T) {
	cases := []struct {
		name          string
		connectionID  string
		tableID       string
		mongoDatabase string
		want          string
	}{
		{"connection scope", "c1", "", "", "ai-schema:c1:sql"},
		{"table scope", "c1", "public.users", "", "ai-schema:c1:sql:public.users"},
		{"mongo scope", "c1", "", "appdb", "ai-schema:c1:mongo:appdb"},
		{"mongo wins over table", "c1", "public.users", "appdb", "ai-schema:c1:mongo:appdb"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := schemaCacheKey(tc.connectionID, tc.tableID, tc.mongoDatabase); got != tc.want {
				t.Fatalf("schemaCacheKey(%q, %q, %q) = %q, want %q",
					tc.connectionID, tc.tableID, tc.mongoDatabase, got, tc.want)
			}
		})
	}
}
