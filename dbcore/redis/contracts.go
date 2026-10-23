package redis

import (
	"context"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// TestConnectionResult aliases the shared engine result.
type TestConnectionResult = engines.TestConnectionResult

// Operations is the connection-level Redis capability. Provider Close is not
// part of the borrowed capability.
type Operations interface {
	TestConnection(ctx context.Context) (*TestConnectionResult, error)
	GetStats(ctx context.Context) (*RedisStats, error)
	GetTTL(ctx context.Context, key string) (int64, error)
	// ForRequest returns a request-scoped capability plus its cleanup func.
	// Closing the request scope does not close the provider or sibling
	// requests; browse-cursor leases outlive it and release via ReleaseCursor.
	ForRequest(ctx context.Context) (RequestOperations, func())
}

// RequestOperations is the request-scoped Redis capability.
type RequestOperations interface {
	ScanKeys(ctx context.Context, in ScanKeysInput) (*KeyPage, error)
	GetKey(ctx context.Context, key string) (*RedisValue, error)
	GetKeyPage(ctx context.Context, in RedisValuePageInput) (*RedisValuePage, error)
	GetTTL(ctx context.Context, key string) (int64, error)
	RunCommand(ctx context.Context, command string) (*CommandResult, error)
	// ReleaseCursor releases a browse-cursor lease early. Cursor lifetime is
	// independent of request-local cleanup.
	ReleaseCursor(cursor string) bool
}
