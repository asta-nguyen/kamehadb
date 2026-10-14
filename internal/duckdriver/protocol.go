// Package duckdriver owns the optional DuckDB executable's private stdio
// protocol and trusted lifecycle. It never imports the native DuckDB library.
package duckdriver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const (
	ProtocolVersion = 2
	MaxMessageBytes = 16 << 20
	MaxStderrBytes  = 16 << 10
	StartupTimeout  = 10 * time.Second
	StopTimeout     = 5 * time.Second

	MethodHello           = "hello"
	MethodOpen            = "open"
	MethodClose           = "close"
	MethodCancel          = "cancel"
	MethodTest            = "test"
	MethodDatabases       = "databases"
	MethodSchemas         = "schemas"
	MethodTables          = "tables"
	MethodColumns         = "columns"
	MethodIndexes         = "indexes"
	MethodCompletions     = "completions"
	MethodPreview         = "preview"
	MethodPreviewMetadata = "previewMetadata"
	MethodQuery           = "query"
	MethodStats           = "stats"
)

// Release builds inject the same tag into both executables and the exact
// uncompressed helper checksum into the desktop. Dev is never a download bypass.
var (
	ReleaseVersion = "dev"
	ReleaseSHA256  = ""
)

type Request struct {
	ID       uint64          `json:"id"`
	Method   string          `json:"method"`
	Params   json.RawMessage `json:"params,omitempty"`
	CancelID uint64          `json:"cancelId,omitempty"`
}

type Response struct {
	ID     uint64          `json:"id"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  string          `json:"error,omitempty"`
}

type Handshake struct {
	Protocol int    `json:"protocol"`
	Version  string `json:"version"`
}

// This private capability carries service-cached native metadata; it is not
// a bound GUI input and the helper still supplies its own cursor scope.
type PreviewMetadataInput struct {
	Input   engines.PreviewRowsInput `json:"input"`
	Columns []engines.ColumnInfo     `json:"columns"`
}

type OpenInput struct {
	FilePath string `json:"filePath"`
	TempDir  string `json:"tempDir"`
}

// Preserve JSON integer tokens across RPC. GUI-safe integers are already
// normalized by the native collector; cursor/native parameter code must never
// receive a float64 merely because a value crossed this private boundary.
func Decode(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("DuckDB driver response: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return fmt.Errorf("DuckDB driver message must contain exactly one JSON value")
	}
	return nil
}
