package api

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

type exportTestLoader struct{}

func (exportTestLoader) ProfileForConnect(string) (engines.ConnProfile, error) {
	return engines.ConnProfile{Kind: "test-native-csv"}, nil
}

type exportTestAdapter struct {
	engines.UnsupportedAdapter
	run func(context.Context, engines.RunQueryInput, io.Writer) (*engines.QueryExportStats, error)
}

func (a *exportTestAdapter) ExportQueryCSV(ctx context.Context, input engines.RunQueryInput, w io.Writer) (*engines.QueryExportStats, error) {
	return a.run(ctx, input, w)
}

// Inject the engine stream, not the file manager, so tests exercise actual
// temporary files and destination replacement without desktop dialogs.
func exportService(t *testing.T, run func(context.Context, engines.RunQueryInput, io.Writer) (*engines.QueryExportStats, error)) *SqlService {
	t.Helper()
	return exportServiceWithPolicy(t, nil, run)
}

func exportServiceWithPolicy(
	t *testing.T,
	policy func(string) (bool, error),
	run func(context.Context, engines.RunQueryInput, io.Writer) (*engines.QueryExportStats, error),
) *SqlService {
	t.Helper()
	registry := testDB(t, exportTestLoader{})
	testRegister(t, registry, "test-native-csv", func(engines.ConnProfile) (engines.SQLAdapter, error) { return &exportTestAdapter{run: run}, nil })
	service := NewSqlService(registry, newTTLCache(), policy)
	t.Cleanup(func() { service.closeExports(); registry.Close() })
	return service
}

func TestNativeExportAtomicSuccessAndFailure(t *testing.T) {
	for _, fail := range []bool{false, true} {
		t.Run(map[bool]string{false: "success", true: "failure"}[fail], func(t *testing.T) {
			service := exportService(t, func(ctx context.Context, input engines.RunQueryInput, w io.Writer) (*engines.QueryExportStats, error) {
				if input.Query != "SELECT original LIMIT 7" {
					t.Fatal("query rewritten")
				}
				n, err := io.WriteString(w, "id\n1\n")
				if fail {
					return nil, errors.New("disk full")
				}
				return &engines.QueryExportStats{Rows: 1, Bytes: int64(n)}, err
			})
			dir := t.TempDir()
			path := filepath.Join(dir, "result.csv")
			if err := os.WriteFile(path, []byte("KEEP"), 0o600); err != nil {
				t.Fatal(err)
			}
			result, err := service.ExportQueryCSV("connection", QueryExportInput{ID: "job", Path: path, Query: "SELECT original LIMIT 7"})
			data, _ := os.ReadFile(path)
			if fail {
				if err == nil || string(data) != "KEEP" {
					t.Fatal("failed export changed destination")
				}
			} else if err != nil || result.Rows != 1 || string(data) != "id\n1\n" {
				t.Fatal("success incomplete", result, err)
			}
			entries, _ := os.ReadDir(dir)
			if len(entries) != 1 {
				t.Fatal("partial file leaked")
			}
		})
	}
}

func TestNativeExportCancelAndShutdownPreserveDestination(t *testing.T) {
	for _, shutdown := range []bool{false, true} {
		t.Run(map[bool]string{false: "cancel", true: "shutdown"}[shutdown], func(t *testing.T) {
			started := make(chan struct{})
			service := exportService(t, func(ctx context.Context, _ engines.RunQueryInput, w io.Writer) (*engines.QueryExportStats, error) {
				_, _ = io.WriteString(w, "partial")
				close(started)
				<-ctx.Done()
				return nil, ctx.Err()
			})
			dir := t.TempDir()
			path := filepath.Join(dir, "result.csv")
			if err := os.WriteFile(path, []byte("KEEP"), 0o600); err != nil {
				t.Fatal(err)
			}
			done := make(chan *QueryExportResult, 1)
			go func() {
				result, err := service.ExportQueryCSV("connection", QueryExportInput{ID: "job", Path: path, Query: "SELECT value"})
				if err != nil {
					t.Error(err)
				}
				done <- result
			}()
			<-started
			if shutdown {
				service.closeExports()
			} else {
				service.CancelExport("job")
			}
			result := <-done
			data, _ := os.ReadFile(path)
			if result == nil || !result.Cancelled || string(data) != "KEEP" {
				t.Fatal("cancel changed destination", result)
			}
			entries, _ := os.ReadDir(dir)
			if len(entries) != 1 {
				t.Fatal("cancel leaked temporary file")
			}
		})
	}
}

func TestNativeExportEarlyCancelAndIndependentJobs(t *testing.T) {
	var mu sync.Mutex
	calls := 0
	service := exportService(t, func(ctx context.Context, _ engines.RunQueryInput, w io.Writer) (*engines.QueryExportStats, error) {
		mu.Lock()
		calls++
		mu.Unlock()
		n, err := io.WriteString(w, "ok\n")
		return &engines.QueryExportStats{Rows: 1, Bytes: int64(n)}, err
	})
	service.CancelExport("early")
	path := filepath.Join(t.TempDir(), "early.csv")
	result, err := service.ExportQueryCSV("connection", QueryExportInput{ID: "early", Path: path, Query: "SELECT 1"})
	if err != nil || !result.Cancelled || calls != 0 {
		t.Fatal("early cancellation executed SQL")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("early cancellation created a file")
	}
	var wg sync.WaitGroup
	for _, id := range []string{"one", "two"} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			_, err := service.ExportQueryCSV("connection", QueryExportInput{ID: id, Path: filepath.Join(t.TempDir(), id+".csv"), Query: "SELECT 1"})
			if err != nil {
				t.Error(err)
			}
		}(id)
	}
	wg.Wait()
	if calls != 2 {
		t.Fatal("independent jobs lost", calls)
	}
}

// Full-query CSV export uses the same persisted policy as RunQuery, and a
// rejected export must not create the destination or a temporary file. (Why)
func TestNativeExportReadOnlyPolicy(t *testing.T) {
	cases := []struct {
		name     string
		readOnly bool
		query    string
		wantErr  bool
	}{
		{name: "read-only rejects update", readOnly: true, query: "UPDATE t SET x = 1", wantErr: true},
		{name: "writable allows update", readOnly: false, query: "UPDATE t SET x = 1"},
		{name: "read-only rejects chain", readOnly: true, query: "UPDATE t SET x = 1; DROP TABLE t", wantErr: true},
		{name: "writable rejects chain", readOnly: false, query: "UPDATE t SET x = 1; DROP TABLE t", wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var calls int
			service := exportServiceWithPolicy(t, func(string) (bool, error) { return tc.readOnly, nil },
				func(_ context.Context, _ engines.RunQueryInput, w io.Writer) (*engines.QueryExportStats, error) {
					calls++
					n, err := io.WriteString(w, "id\n1\n")
					return &engines.QueryExportStats{Rows: 1, Bytes: int64(n)}, err
				})
			dir := t.TempDir()
			path := filepath.Join(dir, "result.csv")
			_, err := service.ExportQueryCSV("connection", QueryExportInput{ID: "job", Path: path, Query: tc.query})
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected policy rejection")
				}
				if calls != 0 {
					t.Fatal("rejected export reached the adapter")
				}
			} else if err != nil {
				t.Fatal(err)
			}
			entries, readErr := os.ReadDir(dir)
			if readErr != nil {
				t.Fatal(readErr)
			}
			if tc.wantErr && len(entries) != 0 {
				t.Fatalf("rejected export left files: %v", entries)
			}
			if !tc.wantErr && len(entries) != 1 {
				t.Fatalf("successful export files = %v", entries)
			}
		})
	}
}

func TestNativeExportFailsClosedOnPolicyLookupError(t *testing.T) {
	service := exportServiceWithPolicy(t, func(string) (bool, error) {
		return false, errors.New("metadata unavailable")
	}, func(context.Context, engines.RunQueryInput, io.Writer) (*engines.QueryExportStats, error) {
		t.Fatal("policy failure reached the adapter")
		return nil, nil
	})
	dir := t.TempDir()
	path := filepath.Join(dir, "result.csv")
	if _, err := service.ExportQueryCSV("connection", QueryExportInput{ID: "job", Path: path, Query: "SELECT 1"}); err == nil {
		t.Fatal("expected policy lookup error")
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Fatalf("policy failure left files: %v", entries)
	}
}
