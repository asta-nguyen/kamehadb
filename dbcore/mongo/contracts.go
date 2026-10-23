package mongo

import (
	"context"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// Shared result aliases; the engine package stays the single source of truth.
type (
	TestConnectionResult = engines.TestConnectionResult
	DatabaseInfo         = engines.DatabaseInfo
)

// Operations is the driver-free MongoDB capability. Provider Close is not
// part of the borrowed capability.
type Operations interface {
	TestConnection(ctx context.Context) (*TestConnectionResult, error)
	ListDatabases(ctx context.Context) ([]DatabaseInfo, error)
	ListCollections(ctx context.Context, database string) ([]CollectionInfo, error)
	FindDocuments(ctx context.Context, in FindDocumentsInput) (*DocumentResult, error)
	CountDocuments(ctx context.Context, in CountDocumentsInput) (*CountResult, error)
	Aggregate(ctx context.Context, in AggregateInput) (*DocumentResult, error)
	RunCommand(ctx context.Context, database string, command any) (any, error)
	UpdateDocument(ctx context.Context, database, collection string, filter, update map[string]any) (map[string]int64, error)
	DeleteDocument(ctx context.Context, database, collection string, filter map[string]any) (map[string]int64, error)
	FindBounded(ctx context.Context, in BoundedFindInput) (*BoundedResult, error)
	AggregateBounded(ctx context.Context, in BoundedAggregateInput) (*BoundedResult, error)
	GetCollectionStats(ctx context.Context, database, collection string) (*CollectionStats, error)
}
