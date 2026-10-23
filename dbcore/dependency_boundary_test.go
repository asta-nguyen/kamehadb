package dbcore_test

// Dependency boundary assertions (plan #110, Task 6): dbcore is the reusable
// provider core — nothing under it may import application internals or Wails,
// and the root/contract packages must stay driver-free so consumers can depend
// on the interfaces without pulling native drivers. Source parsing (not
// `go list`) keeps this test hermetic and offline.

import (
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strings"
	"testing"
)

// driverPrefixes are the concrete database drivers allowed only inside
// dbcore/providers/* and dbcore/duckdriver implementation packages.
var driverPrefixes = []string{
	"github.com/jackc/pgx",
	"github.com/go-sql-driver/mysql",
	"github.com/microsoft/go-mssqldb",
	"github.com/sijms/go-ora",
	"github.com/ClickHouse/clickhouse-go",
	"github.com/marcboeker/go-duckdb",
	"github.com/duckdb/duckdb-go-bindings",
	"go.mongodb.org/mongo-driver",
	"github.com/redis/go-redis",
	"modernc.org/sqlite",
}

// contractDirs are the packages external consumers compile against; they must
// not drag driver dependencies in. Paths are relative to the dbcore root.
var contractDirs = map[string]bool{
	".":         true, // dbcore root: Provider/Manager/Registry/capabilities
	"engines":   true, // shared SQL contract + kind metadata
	"mongo":     true, // driver-free mongo.Operations contract
	"redis":     true, // driver-free redis.Operations/RequestOperations contract
	"sqlsafety": true, // read-only SQL classification helpers
}

func TestDependencyBoundary(t *testing.T) {
	fset := token.NewFileSet()
	err := filepath.WalkDir(".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") {
			return nil
		}
		f, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}
		dir := filepath.Dir(path)
		for _, imp := range f.Imports {
			p := strings.Trim(imp.Path.Value, `"`)
			if strings.Contains(p, "kamehadb/internal") {
				t.Errorf("%s imports app-internal package %s", path, p)
			}
			if strings.Contains(p, "wailsapp") {
				t.Errorf("%s imports Wails package %s", path, p)
			}
			if contractDirs[dir] {
				for _, drv := range driverPrefixes {
					if strings.HasPrefix(p, drv) {
						t.Errorf("%s imports driver %s in driver-free contract package", path, p)
					}
				}
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
