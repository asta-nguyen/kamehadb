package sqlite

import "testing"

// Read settings back from both real constructors rather than trusting the
// configuration text; the read-only path must receive the same native bounds.
func TestSQLiteMemoryDefaults(t *testing.T) {
	normal, path := openTest(t)
	readonly, err := NewMCP(path)
	if err != nil {
		t.Fatal(err)
	}
	defer readonly.Close()
	for _, adapter := range []*Adapter{normal, readonly} {
		for name, want := range map[string]int64{"cache_size": -sqlitePageCacheKiB, "mmap_size": sqliteMmapBytes, "temp_store": 1} {
			var got int64
			if err := adapter.db.QueryRow("PRAGMA " + name).Scan(&got); err != nil {
				t.Fatal(err)
			}
			if got != want {
				t.Fatalf("%s: got %d, want %d", name, got, want)
			}
		}
	}
}
