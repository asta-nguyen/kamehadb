package duckdb

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/duckdriver"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

const (
	testDriverEnv     = "KAMEHADB_TEST_DUCKDB_DRIVER"
	testDriverTimeout = 10 * time.Second
	testQueryCancel   = 50 * time.Millisecond
)

// testRuntimeDir resolves the same env-override data dir the app passes via
// all.Options — kept local so the package stays free of internal/store.
func testRuntimeDir() (string, error) {
	if dir := os.Getenv("KAMEHADB_DATA_DIR"); dir != "" {
		return dir, nil
	}
	return "", errors.New("KAMEHADB_DATA_DIR is not set")
}

func TestConstructionAndBackgroundHealthNeverStartOrInstall(t *testing.T) {
	root := t.TempDir()
	t.Setenv("KAMEHADB_DATA_DIR", filepath.Join(root, "data"))
	t.Setenv(duckdriver.LocalDriverEnv, filepath.Join(root, "missing-driver"))
	file := filepath.Join(root, "missing.duckdb")
	a, err := New(file, testRuntimeDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	res, err := a.BackgroundHealth(context.Background())
	if err != nil || res.Success || !strings.Contains(res.Message, "explicitly test") {
		t.Fatal(res, err)
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("background health created a DB", err)
	}
	if _, err := os.Stat(filepath.Join(root, "data")); !os.IsNotExist(err) {
		t.Fatal("background health created a driver cache", err)
	}
	if _, err := New("", testRuntimeDir, nil); err == nil {
		t.Fatal("empty file path accepted")
	}
}

// Opt-in native worker test, never a production-profile fixture. The normal
// native adapter tests remain in embedded; this separately verifies real RPC.
func TestManagedNativeDuckDB(t *testing.T) {
	path := os.Getenv(testDriverEnv)
	if path == "" {
		t.Skip("set " + testDriverEnv + " to an explicitly built native helper")
	}
	root := t.TempDir()
	t.Setenv("KAMEHADB_DATA_DIR", filepath.Join(root, "data"))
	t.Setenv(duckdriver.LocalDriverEnv, path)
	file := filepath.Join(root, "private.duckdb")
	a, err := New(file, testRuntimeDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	ctx, cancel := context.WithTimeout(context.Background(), testDriverTimeout)
	defer cancel()
	res, err := a.TestConnection(ctx)
	if err != nil || !res.Success || res.ServerVersion == "" {
		t.Fatal(res, err)
	}
	for _, sql := range []string{
		"CREATE TABLE users(id BIGINT PRIMARY KEY, name VARCHAR)",
		"INSERT INTO users VALUES (1,'alice'),(2,'bob'),(9007199254740993,'日本語')",
	} {
		if _, err := a.RunQuery(ctx, engines.RunQueryInput{Query: sql}); err != nil {
			t.Fatal(err)
		}
	}
	main := "main"
	tables, err := a.ListTables(ctx, &main)
	if err != nil || len(tables) != 1 {
		t.Fatal(tables, err)
	}
	columns, err := a.GetTableColumns(ctx, "main.users")
	if err != nil || len(columns) != 2 || !columns[0].PrimaryKey {
		t.Fatal(columns, err)
	}
	indexes, err := a.GetTableIndexes(ctx, "main.users")
	if err != nil || len(indexes) == 0 {
		t.Fatal(indexes, err)
	}
	completions, err := a.GetCompletions(ctx, &main)
	if err != nil || len(completions) != 1 {
		t.Fatal(completions, err)
	}
	stats, err := a.GetTableStats(ctx, "main.users")
	if err != nil || stats.RowEstimate != 3 {
		t.Fatal(stats, err)
	}
	limit := int64(2)
	page, err := a.PreviewRows(ctx, engines.PreviewRowsInput{TableID: "main.users", Limit: &limit, SortColumn: "id"})
	if err != nil || page.RowCount != 2 || page.HasMore == nil || !*page.HasMore {
		t.Fatal(page, err)
	}
	query, err := a.RunQuery(ctx, engines.RunQueryInput{Query: "SELECT * FROM users ORDER BY id"})
	if err != nil || query.Rows[2]["id"] != "9007199254740993" {
		t.Fatal(query, err)
	}
	settings, err := a.RunQuery(ctx, engines.RunQueryInput{Query: "SELECT current_setting('threads') AS threads,current_setting('memory_limit') AS memory,current_setting('temp_directory') AS spill"})
	if err != nil || settings.Rows[0]["threads"] != json.Number("2") || !strings.Contains(settings.Rows[0]["memory"].(string), "64.0 MiB") || settings.Rows[0]["spill"] != a.spillDir {
		t.Fatal(settings, err)
	}
	short, stop := context.WithTimeout(ctx, testQueryCancel)
	_, err = a.RunQuery(short, engines.RunQueryInput{Query: "SELECT SUM(i) FROM range(10000000000) t(i)"})
	stop()
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("real native interruption: %v", err)
	}
	if _, err := a.RunQuery(ctx, engines.RunQueryInput{Query: "SELECT 7"}); err != nil {
		t.Fatalf("reuse after native cancellation: %v", err)
	}
	if health, err := a.BackgroundHealth(ctx); err != nil || !health.Success {
		t.Fatal(health, err)
	}
	if err := a.Close(); err != nil {
		t.Fatal(err)
	}
	spills, _ := filepath.Glob(filepath.Join(root, "data", "drivers", "duckdb", "spill", "session-*"))
	if len(spills) != 0 {
		t.Fatalf("spill directories leaked: %v", spills)
	}
	if _, err := os.Stat(file); err != nil {
		t.Fatalf("cleanup removed database: %v", err)
	}
	reopened, err := New(file, testRuntimeDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	if result, err := reopened.TestConnection(ctx); err != nil || !result.Success {
		t.Fatalf("child/file lock leaked: %v %v", result, err)
	}
}

// Two registrations bind their own runtime options into each constructed
// adapter — no shared package-global state can leak between registries.
func TestRegisterCapturesPerRegistryRuntimeOptions(t *testing.T) {
	dirA := func() (string, error) { return "/reg-a", nil }
	dirB := func() (string, error) { return "/reg-b", nil }
	var logged []string

	regA := dbcore.NewRegistry()
	if err := Register(regA, dirA, func(msg string) { logged = append(logged, "A:"+msg) }); err != nil {
		t.Fatal(err)
	}
	regB := dbcore.NewRegistry()
	if err := Register(regB, dirB, nil); err != nil {
		t.Fatal(err)
	}

	file := filepath.Join(t.TempDir(), "x.duckdb")
	pa, err := regA.Open(context.Background(), engines.KindDuckDB, dbcore.Config{FilePath: file})
	if err != nil {
		t.Fatal(err)
	}
	defer pa.Close()
	pb, err := regB.Open(context.Background(), engines.KindDuckDB, dbcore.Config{FilePath: file})
	if err != nil {
		t.Fatal(err)
	}
	defer pb.Close()

	aa, err := dbcore.SQL(pa)
	if err != nil {
		t.Fatal(err)
	}
	bb, err := dbcore.SQL(pb)
	if err != nil {
		t.Fatal(err)
	}
	da, _ := aa.(*Adapter).runtimeDir()
	db2, _ := bb.(*Adapter).runtimeDir()
	if da != "/reg-a" || db2 != "/reg-b" {
		t.Fatalf("runtime options leaked across registries: %q %q", da, db2)
	}
}
