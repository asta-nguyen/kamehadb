package api

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const (
	maxExportJobs                 = 4
	maxPendingExportCancellations = 64
	pendingExportCancellationTTL  = time.Minute
	maxExportIDBytes              = 128
)

type QueryExportInput struct {
	ID     string `json:"id"`
	Path   string `json:"path"`
	Query  string `json:"query"`
	Params []any  `json:"params,omitempty"`
}

type QueryExportResult struct {
	Rows      int64  `json:"rows"`
	Bytes     int64  `json:"bytes"`
	Path      string `json:"path"`
	Cancelled bool   `json:"cancelled"`
}

// Services, not another bound app lifecycle, owns cancellation at shutdown.
// Tests can use the default root; Wails startup supplies its actual context.
func (s *SqlService) startExports(ctx context.Context) {
	s.exportsMu.Lock()
	defer s.exportsMu.Unlock()
	s.exportCancel()
	s.exportRoot, s.exportCancel = context.WithCancel(ctx)
}

func (s *SqlService) closeExports() {
	s.exportsMu.Lock()
	s.exportsClosed = true
	s.exportCancel()
	s.exportsMu.Unlock()
	s.exportsWG.Wait()
}

// Register before connection lookup/query work. A small expiring cancellation
// set handles a Wails scheduling race where Cancel arrives before registration.
func (s *SqlService) registerExport(id string) (context.Context, context.CancelFunc, error) {
	if strings.TrimSpace(id) == "" || len(id) > maxExportIDBytes {
		return nil, nil, errors.New("Invalid export ID")
	}
	s.exportsMu.Lock()
	defer s.exportsMu.Unlock()
	if s.exportsClosed {
		return nil, nil, errors.New("Application is shutting down")
	}
	if _, exists := s.exports[id]; exists {
		return nil, nil, errors.New("Export ID is already running")
	}
	if len(s.exports) >= maxExportJobs {
		return nil, nil, errors.New("Too many exports are running; wait for one to finish")
	}
	ctx, cancel := context.WithCancel(s.exportRoot)
	if at, ok := s.cancelledExports[id]; ok {
		delete(s.cancelledExports, id)
		if time.Since(at) < pendingExportCancellationTTL {
			cancel()
		}
	}
	s.exports[id] = cancel
	s.exportsWG.Add(1)
	return ctx, cancel, nil
}

func (s *SqlService) finishExport(id string) {
	s.exportsMu.Lock()
	delete(s.exports, id)
	s.exportsMu.Unlock()
	s.exportsWG.Done()
}

func (s *SqlService) CancelExport(id string) bool {
	if strings.TrimSpace(id) == "" || len(id) > maxExportIDBytes {
		return false
	}
	s.exportsMu.Lock()
	defer s.exportsMu.Unlock()
	if s.exportsClosed {
		return false
	}
	if cancel, ok := s.exports[id]; ok {
		cancel()
		return true
	}
	for pending, at := range s.cancelledExports {
		if time.Since(at) >= pendingExportCancellationTTL {
			delete(s.cancelledExports, pending)
		}
	}
	if len(s.cancelledExports) >= maxPendingExportCancellations {
		return false
	}
	s.cancelledExports[id] = time.Now()
	return true
}

// Write to a same-directory temporary file. No failed/cancelled job can leave
// a partial destination, and the response never contains exported row data.
func (s *SqlService) ExportQueryCSV(connectionID string, input QueryExportInput) (*QueryExportResult, error) {
	ctx, cancel, err := s.registerExport(input.ID)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer s.finishExport(input.ID)
	cancelled := func() (*QueryExportResult, error) { return &QueryExportResult{Path: input.Path, Cancelled: true}, nil }
	if ctx.Err() != nil {
		return cancelled()
	}
	if input.Path == "" || !filepath.IsAbs(input.Path) {
		return nil, errors.New("Choose an absolute export file path")
	}
	adapter, err := s.registry.Get(ctx, connectionID)
	if err != nil {
		return nil, err
	}
	exporter, ok := adapter.(engines.QueryExporter)
	if !ok {
		return nil, errors.New("Full CSV export currently supports PostgreSQL and SQLite; export displayed rows instead")
	}
	file, err := os.CreateTemp(filepath.Dir(input.Path), ".kamehadb-export-*.csv")
	if err != nil {
		return nil, err
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	defer file.Close()
	stats, err := exporter.ExportQueryCSV(ctx, engines.RunQueryInput{Query: input.Query, Params: input.Params}, file)
	if err != nil {
		if ctx.Err() != nil || errors.Is(err, context.Canceled) {
			return cancelled()
		}
		return nil, err
	}
	if err := file.Close(); err != nil {
		return nil, err
	}
	// Linearize commit against Cancel: cancellation winning this lock keeps
	// the old file; cancellation after rename is too late to undo a success.
	s.exportsMu.Lock()
	defer s.exportsMu.Unlock()
	if ctx.Err() != nil {
		return cancelled()
	}
	if err := os.Rename(temporary, input.Path); err != nil {
		return nil, err
	}
	return &QueryExportResult{Rows: stats.Rows, Bytes: stats.Bytes, Path: input.Path}, nil
}
