// Package duckdb preserves the SQL adapter surface without linking DuckDB's
// native library into the desktop. One owned helper serves an active profile.
package duckdb

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"

	"github.com/asta-nguyen/kamehadb/dbcore/duckdriver"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

var errClosed = errors.New("DuckDB connection is closed; reopen it")

type Adapter struct {
	filePath    string
	runtimeDir  func() (string, error)
	runtimeLogf func(string)
	mu          sync.Mutex
	client      *duckdriver.Client
	spillDir    string
	closed      bool
	starting    chan struct{}
	startCancel context.CancelFunc
}

// New builds a lazy adapter: the runtime directory resolver and optional
// diagnostic logger are captured per registration, so two registries with
// different options never share mutable package state. Construction must not
// create directories, download helpers or spawn processes — initialization
// waits for an explicit operation.
func New(filePath string, dir func() (string, error), logf func(string)) (*Adapter, error) {
	if filePath == "" {
		return nil, errors.New("duckdb file path is required")
	}
	if logf == nil {
		logf = func(string) {}
	}
	return &Adapter{filePath: filePath, runtimeDir: dir, runtimeLogf: logf}, nil
}

// Only initialization is shared. Failure before opening is retryable on a
// later explicit action; a crashed initialized client is never auto-restarted.
func (a *Adapter) driver(ctx context.Context) (*duckdriver.Client, error) {
	for {
		a.mu.Lock()
		if a.closed {
			a.mu.Unlock()
			return nil, errClosed
		}
		if a.client != nil {
			client := a.client
			a.mu.Unlock()
			return client, nil
		}
		if a.starting != nil {
			done := a.starting
			a.mu.Unlock()
			select {
			case <-done:
				continue
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		done := make(chan struct{})
		startCtx, cancel := context.WithCancel(ctx)
		a.starting, a.startCancel = done, cancel
		a.mu.Unlock()

		client, spill, err := a.start(startCtx)
		cancel()
		a.mu.Lock()
		if a.closed && err == nil {
			err = errClosed
		}
		if err == nil {
			a.client, a.spillDir = client, spill
		}
		// Close waits for startup cleanup too, not only the spawning goroutine.
		if err != nil {
			a.mu.Unlock()
			if client != nil {
				_ = client.Close()
			}
			if spill != "" {
				_ = os.RemoveAll(spill)
			}
			a.mu.Lock()
		}
		a.starting, a.startCancel = nil, nil
		close(done)
		a.mu.Unlock()
		return client, err
	}
}

func (a *Adapter) start(ctx context.Context) (*duckdriver.Client, string, error) {
	if a.runtimeDir == nil {
		return nil, "", errors.New("duckdb runtime directory is not configured")
	}
	dataDir, err := a.runtimeDir()
	if err != nil {
		return nil, "", err
	}
	path, err := duckdriver.Resolve(ctx, dataDir)
	if err != nil {
		return nil, "", err
	}
	if duckdriver.ReleaseVersion == "dev" {
		a.runtimeLogf("explicit development driver override: " + path)
	}
	root := filepath.Join(dataDir, "drivers", "duckdb", "spill")
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, "", err
	}
	if err := os.Chmod(root, 0o700); err != nil {
		return nil, "", err
	}
	spill, err := os.MkdirTemp(root, "session-*")
	if err != nil {
		return nil, "", err
	}
	client, err := duckdriver.Start(ctx, path, duckdriver.OpenInput{FilePath: a.filePath, TempDir: spill})
	return client, spill, err
}

func request[T any](ctx context.Context, a *Adapter, method string, input any) (T, error) {
	var output T
	client, err := a.driver(ctx)
	if err != nil {
		return output, err
	}
	err = client.Call(ctx, method, input, &output)
	return output, err
}

func (a *Adapter) TestConnection(ctx context.Context) (*engines.TestConnectionResult, error) {
	return request[*engines.TestConnectionResult](ctx, a, duckdriver.MethodTest, nil)
}

func (a *Adapter) ListDatabases(ctx context.Context) ([]engines.DatabaseInfo, error) {
	return request[[]engines.DatabaseInfo](ctx, a, duckdriver.MethodDatabases, nil)
}

func (a *Adapter) ListSchemas(ctx context.Context, schema *string) ([]engines.SchemaInfo, error) {
	return request[[]engines.SchemaInfo](ctx, a, duckdriver.MethodSchemas, schema)
}

func (a *Adapter) ListTables(ctx context.Context, schema *string) ([]engines.TableInfo, error) {
	return request[[]engines.TableInfo](ctx, a, duckdriver.MethodTables, schema)
}

func (a *Adapter) GetTableColumns(ctx context.Context, table string) ([]engines.ColumnInfo, error) {
	return request[[]engines.ColumnInfo](ctx, a, duckdriver.MethodColumns, table)
}

func (a *Adapter) GetTableIndexes(ctx context.Context, table string) ([]engines.IndexInfo, error) {
	return request[[]engines.IndexInfo](ctx, a, duckdriver.MethodIndexes, table)
}

func (a *Adapter) GetCompletions(ctx context.Context, schema *string) ([]engines.TableCompletions, error) {
	return request[[]engines.TableCompletions](ctx, a, duckdriver.MethodCompletions, schema)
}

func (a *Adapter) PreviewRows(ctx context.Context, input engines.PreviewRowsInput) (*engines.QueryResult, error) {
	return request[*engines.QueryResult](ctx, a, duckdriver.MethodPreview, input)
}

// Keep the normal service metadata TTL effective across the private boundary.
// The child scopes and types the cursor before binding its native parameters.
func (a *Adapter) PreviewRowsWithColumns(ctx context.Context, input engines.PreviewRowsInput, columns []engines.ColumnInfo) (*engines.QueryResult, error) {
	return request[*engines.QueryResult](ctx, a, duckdriver.MethodPreviewMetadata, duckdriver.PreviewMetadataInput{Input: input, Columns: columns})
}

func (a *Adapter) RunQuery(ctx context.Context, input engines.RunQueryInput) (*engines.QueryResult, error) {
	return request[*engines.QueryResult](ctx, a, duckdriver.MethodQuery, input)
}

func (a *Adapter) GetTableStats(ctx context.Context, table string) (*engines.TableStats, error) {
	return request[*engines.TableStats](ctx, a, duckdriver.MethodStats, table)
}

// Background probes reuse only an already active child. They never install,
// start an unused helper, create a database, or contend with its file lock.
func (a *Adapter) BackgroundHealth(ctx context.Context) (*engines.TestConnectionResult, error) {
	a.mu.Lock()
	client := a.client
	closed := a.closed
	a.mu.Unlock()
	if closed {
		return nil, errClosed
	}
	if client == nil {
		return &engines.TestConnectionResult{Success: false, Message: "Open or explicitly test DuckDB to initialize its optional driver"}, nil
	}
	var result engines.TestConnectionResult
	err := client.Call(ctx, duckdriver.MethodTest, nil, &result)
	return &result, err
}

func (a *Adapter) Close() error {
	a.mu.Lock()
	if a.closed {
		a.mu.Unlock()
		return nil
	}
	a.closed = true
	if a.startCancel != nil {
		a.startCancel()
	}
	done, client, spill := a.starting, a.client, a.spillDir
	a.mu.Unlock()
	if done != nil {
		<-done
	}
	var err error
	if client != nil {
		err = client.Close()
	}
	// Remove only this parent's generated spill directory, never the DB file.
	if spill != "" {
		_ = os.RemoveAll(spill)
	}
	return err
}
