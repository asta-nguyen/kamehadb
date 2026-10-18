package duckdriver

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

// Serve registers each job on the input thread before starting its worker.
// Cancel notices therefore target the native context, not merely a GUI promise.
// The opener is injected so this protocol package never imports the native DLL.
func Serve(parent context.Context, input io.Reader, output io.Writer, open func(context.Context, OpenInput) (engines.SQLAdapter, error)) error {
	ctx, stop := context.WithCancel(parent)
	defer stop()
	var adapter engines.SQLAdapter
	var adapterMu sync.Mutex
	var jobsMu, outputMu sync.Mutex
	jobs := make(map[uint64]context.CancelFunc)
	var workers sync.WaitGroup
	respond := func(id uint64, value any, err error) error {
		response := Response{ID: id}
		if err == nil {
			response.Result, err = json.Marshal(value)
		}
		if err != nil {
			response.Error = err.Error()
		}
		data, encodeErr := json.Marshal(response)
		if encodeErr != nil {
			return encodeErr
		}
		if len(data) > MaxMessageBytes {
			data, _ = json.Marshal(Response{ID: id, Error: "DuckDB response exceeds the private protocol limit; SQL may already have executed; do not replay it automatically"})
		}
		outputMu.Lock()
		defer outputMu.Unlock()
		_, err = output.Write(append(data, '\n'))
		return err
	}
	cleanup := func() error {
		stop()
		jobsMu.Lock()
		for _, cancel := range jobs {
			cancel()
		}
		jobsMu.Unlock()
		workers.Wait()
		if adapter != nil {
			return adapter.Close()
		}
		return nil
	}
	defer func() { _ = cleanup() }()
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, initialMessageBuffer), MaxMessageBytes+1)
	for scanner.Scan() {
		var request Request
		if err := Decode(scanner.Bytes(), &request); err != nil {
			return err
		}
		if request.Method == MethodCancel {
			jobsMu.Lock()
			cancel := jobs[request.CancelID]
			jobsMu.Unlock()
			if cancel != nil {
				cancel()
			}
			continue
		}
		if request.ID == 0 {
			return errors.New("DuckDB request ID must be nonzero")
		}
		if request.Method == MethodHello {
			if err := respond(request.ID, Handshake{Protocol: ProtocolVersion, Version: ReleaseVersion}, nil); err != nil {
				return err
			}
			continue
		}
		if request.Method == MethodClose {
			err := cleanup()
			adapter = nil
			return respond(request.ID, true, err)
		}
		jobsMu.Lock()
		if _, exists := jobs[request.ID]; exists || len(jobs) >= maxDriverJobs {
			jobsMu.Unlock()
			if err := respond(request.ID, nil, errors.New("DuckDB driver is busy or request ID is duplicated; no SQL was executed")); err != nil {
				return err
			}
			continue
		}
		jobCtx, cancel := context.WithCancel(ctx)
		jobs[request.ID] = cancel
		workers.Add(1)
		jobsMu.Unlock()
		go func(request Request) {
			defer workers.Done()
			defer cancel()
			defer func() { jobsMu.Lock(); delete(jobs, request.ID); jobsMu.Unlock() }()
			var value any
			var err error
			if request.Method == MethodOpen {
				var params OpenInput
				err = Decode(request.Params, &params)
				if err == nil {
					adapterMu.Lock()
					if adapter != nil {
						err = errors.New("DuckDB driver already has an open database")
					} else {
						adapter, err = open(jobCtx, params)
						value = true
					}
					adapterMu.Unlock()
				}
			} else {
				adapterMu.Lock()
				current := adapter
				adapterMu.Unlock()
				if current == nil {
					err = errors.New("DuckDB driver has no open database")
				} else {
					value, err = dispatch(jobCtx, current, request)
				}
			}
			if err := respond(request.ID, value, err); err != nil {
				stop()
			}
		}(request)
	}
	return scanner.Err()
}

// Keep the wire surface limited to existing adapter methods. Native values
// and SQL travel as data; there is no shell, public port or plugin interpreter.
func dispatch(ctx context.Context, adapter engines.SQLAdapter, request Request) (any, error) {
	switch request.Method {
	case MethodTest:
		return adapter.TestConnection(ctx)
	case MethodDatabases:
		return adapter.ListDatabases(ctx)
	case MethodSchemas, MethodTables, MethodCompletions:
		var scope *string
		if err := Decode(request.Params, &scope); err != nil {
			return nil, err
		}
		switch request.Method {
		case MethodSchemas:
			return adapter.ListSchemas(ctx, scope)
		case MethodTables:
			return adapter.ListTables(ctx, scope)
		default:
			return adapter.GetCompletions(ctx, scope)
		}
	case MethodColumns, MethodIndexes, MethodStats:
		var table string
		if err := Decode(request.Params, &table); err != nil {
			return nil, err
		}
		switch request.Method {
		case MethodColumns:
			return adapter.GetTableColumns(ctx, table)
		case MethodIndexes:
			return adapter.GetTableIndexes(ctx, table)
		default:
			if stats, ok := adapter.(engines.TableStatser); ok {
				return stats.GetTableStats(ctx, table)
			}
			return nil, errors.New("DuckDB table stats are not supported")
		}
	case MethodPreviewMetadata:
		var params PreviewMetadataInput
		if err := Decode(request.Params, &params); err != nil {
			return nil, err
		}
		planner, ok := adapter.(engines.MetadataPreviewer)
		if !ok {
			return nil, errors.New("DuckDB driver lacks metadata preview capability")
		}
		return planner.PreviewRowsWithColumns(ctx, params.Input, params.Columns)
	case MethodPreview:
		var params engines.PreviewRowsInput
		if err := Decode(request.Params, &params); err != nil {
			return nil, err
		}
		return adapter.PreviewRows(ctx, params)
	case MethodQuery:
		var params engines.RunQueryInput
		if err := Decode(request.Params, &params); err != nil {
			return nil, err
		}
		return adapter.RunQuery(ctx, params)
	default:
		return nil, fmt.Errorf("DuckDB driver method %q is not supported", request.Method)
	}
}
