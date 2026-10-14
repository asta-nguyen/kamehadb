// Package mongo ports adapters/mongodb.ts on mongo-driver/v2, including
// the MCP bounded read extensions and the mongosh resolution helpers.
package mongo

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const (
	serverSelectionTimeout  = 5 * time.Second
	mcpQueryTimeout         = 30 * time.Second
	defaultLimit            = 100
	maxLimit                = 1000
	disabledAdaptiveRetries = 0
)

type Config struct {
	ConnectionString string
	Database         string
}

type Adapter struct {
	cfg    Config
	client *mongo.Client
}

// RunCommand has no ordinary retry mode, but driver v2 also retries Atlas
// overload labels. Override URI adaptive retries so an arbitrary write is not
// replayed; ordinary safe-read retry behavior remains unchanged.
func clientOptions(cfg Config) *options.ClientOptions {
	return options.Client().ApplyURI(cfg.ConnectionString).
		SetServerSelectionTimeout(serverSelectionTimeout).
		SetMaxAdaptiveRetries(disabledAdaptiveRetries)
}

func New(cfg Config) (*Adapter, error) {
	if cfg.ConnectionString == "" {
		return nil, errors.New("MongoDB connection string is required")
	}
	client, err := mongo.Connect(clientOptions(cfg))
	if err != nil {
		return nil, err
	}
	return &Adapter{cfg: cfg, client: client}, nil
}

// serializeDocument mirrors the TS serializeDocument: ObjectIds and Dates
// become JSON-safe values; everything else recurses.
func serializeDocument(doc bson.M) map[string]any {
	out := make(map[string]any, len(doc))
	for k, v := range doc {
		out[k] = serializeValue(v)
	}
	return out
}

func serializeValue(v any) any {
	switch t := v.(type) {
	case nil:
		return nil
	case bson.ObjectID:
		return t.Hex()
	case bson.DateTime:
		return t.Time().UTC().Format("2006-01-02T15:04:05.000Z")
	case time.Time:
		return t.UTC().Format("2006-01-02T15:04:05.000Z")
	case bson.Decimal128:
		return t.String()
	case bson.M:
		return serializeDocument(t)
	case bson.D:
		out := make(map[string]any, len(t))
		for _, e := range t {
			out[e.Key] = serializeValue(e.Value)
		}
		return out
	case bson.A:
		arr := make([]any, len(t))
		for i, e := range t {
			arr[i] = serializeValue(e)
		}
		return arr
	case []byte:
		return string(t)
	case int64:
		// convertBigInt — beyond float64-safe integers become strings.
		if t > 9007199254740991 || t < -9007199254740991 {
			return fmt.Sprintf("%d", t)
		}
		return t
	default:
		return v
	}
}

// sanitizeFilter ports the NoSQL-injection guard: a filter VALUE that is a
// plain object containing $-keys is wrapped in $eq so it matches literally
// instead of executing operators.
func sanitizeFilter(filter map[string]any) map[string]any {
	out := make(map[string]any, len(filter))
	for k, v := range filter {
		if obj, ok := v.(map[string]any); ok {
			hasOp := false
			for key := range obj {
				if len(key) > 0 && key[0] == '$' {
					hasOp = true
					break
				}
			}
			if hasOp {
				out[k] = map[string]any{"$eq": obj}
				continue
			}
		}
		out[k] = v
	}
	return out
}

func hasWritingStage(pipeline []map[string]any) bool {
	for _, stage := range pipeline {
		if _, ok := stage["$out"]; ok {
			return true
		}
		if _, ok := stage["$merge"]; ok {
			return true
		}
	}
	return false
}

func (a *Adapter) db(database string) *mongo.Database {
	if database != "" {
		return a.client.Database(database)
	}
	return a.client.Database(a.cfg.Database)
}

// TestConnectionResult / DatabaseInfo alias the shared engine types.
type TestConnectionResult = engines.TestConnectionResult
type DatabaseInfo = engines.DatabaseInfo

// CollectionInfo mirrors the shared CollectionInfo.
type CollectionInfo struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	DocumentCount *int64 `json:"documentCount,omitempty"`
}

// TestConnection mirrors testConnection — fresh client, buildInfo.
func (a *Adapter) TestConnection(ctx context.Context) (*TestConnectionResult, error) {
	temp, err := mongo.Connect(options.Client().
		ApplyURI(a.cfg.ConnectionString).
		SetServerSelectionTimeout(serverSelectionTimeout))
	if err != nil {
		return &TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	defer temp.Disconnect(context.Background())
	if err := temp.Ping(ctx, nil); err != nil {
		return &TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	var info bson.M
	if err := temp.Database("admin").RunCommand(ctx, bson.M{"buildInfo": 1}).Decode(&info); err != nil {
		return &TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	version, _ := info["version"].(string)
	return &TestConnectionResult{Success: true, ServerVersion: "MongoDB " + version}, nil
}

func (a *Adapter) ListDatabases(ctx context.Context) ([]DatabaseInfo, error) {
	res, err := a.client.ListDatabases(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := make([]DatabaseInfo, 0, len(res.Databases))
	for _, d := range res.Databases {
		out = append(out, DatabaseInfo{Name: d.Name})
	}
	return out, nil
}

func (a *Adapter) ListCollections(ctx context.Context, database string) ([]CollectionInfo, error) {
	db := a.db(database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	cursor, err := db.ListCollections(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	out := []CollectionInfo{}
	for cursor.Next(ctx) {
		var spec struct {
			Name string `bson:"name"`
			Type string `bson:"type"`
		}
		if err := cursor.Decode(&spec); err != nil {
			return nil, err
		}
		typ := spec.Type
		if typ == "" {
			typ = "collection"
		}
		out = append(out, CollectionInfo{Name: spec.Name, Type: typ})
	}
	return out, cursor.Err()
}

// FindDocumentsInput mirrors the zod schema in routes/mongo.ts.
type FindDocumentsInput struct {
	Collection string           `json:"collection"`
	Database   string           `json:"database,omitempty"`
	Filter     map[string]any   `json:"filter,omitempty"`
	Projection map[string]any   `json:"projection,omitempty"`
	Sort       map[string]int32 `json:"sort,omitempty"`
	Skip       int64            `json:"skip,omitempty"`
	Limit      int64            `json:"limit,omitempty"`
	Search     string           `json:"search,omitempty"`
	RequestID  *string          `json:"requestId,omitempty"`
}

type DocumentResult struct {
	Documents  []map[string]any `json:"documents"`
	TotalCount int64            `json:"totalCount"`
	HasMore    bool             `json:"hasMore"`
	DurationMs int64            `json:"durationMs"`
}

func sortDoc(sortMap map[string]int32) bson.D {
	if len(sortMap) == 0 {
		return nil
	}
	keys := make([]string, 0, len(sortMap))
	for k := range sortMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	doc := bson.D{}
	for _, k := range keys {
		doc = append(doc, bson.E{Key: k, Value: sortMap[k]})
	}
	return doc
}

func (a *Adapter) FindDocuments(ctx context.Context, in FindDocumentsInput) (*DocumentResult, error) {
	start := time.Now()
	db := a.db(in.Database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	coll := db.Collection(in.Collection)

	filter := in.Filter
	if filter == nil {
		filter = map[string]any{}
	}
	queryFilter := sanitizeFilter(filter)

	// Server-side text search across string fields of a sample doc.
	if in.Search != "" {
		var sample bson.M
		if err := coll.FindOne(ctx, bson.M{}).Decode(&sample); err == nil && sample != nil {
			var stringFields []string
			for k, v := range sample {
				if _, ok := v.(string); ok {
					stringFields = append(stringFields, k)
				}
			}
			if len(stringFields) > 0 {
				regex := regexp.QuoteMeta(in.Search)
				var orClauses []any
				for _, f := range stringFields {
					orClauses = append(orClauses, bson.M{f: bson.M{"$regex": regex, "$options": "i"}})
				}
				searchClause := bson.M{"$or": orClauses}
				if len(queryFilter) > 0 {
					queryFilter = map[string]any{"$and": []any{queryFilter, searchClause}}
				} else {
					queryFilter = searchClause
				}
			}
		}
	}

	limit := in.Limit
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	total, err := coll.CountDocuments(ctx, queryFilter)
	if err != nil {
		return nil, err
	}
	opts := options.Find().SetSkip(in.Skip).SetLimit(limit + 1)
	if in.Projection != nil {
		opts.SetProjection(in.Projection)
	}
	if sd := sortDoc(in.Sort); sd != nil {
		opts.SetSort(sd)
	}
	cursor, err := coll.Find(ctx, queryFilter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	documents := []map[string]any{}
	hasMore := false
	i := int64(0)
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		if i < limit {
			documents = append(documents, serializeDocument(doc))
		} else {
			hasMore = true
		}
		i++
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}
	return &DocumentResult{
		Documents:  documents,
		TotalCount: total,
		HasMore:    hasMore,
		DurationMs: time.Since(start).Milliseconds(),
	}, nil
}

func (a *Adapter) RunCommand(ctx context.Context, database string, command map[string]any) (any, error) {
	db := a.db(database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	var res bson.M
	if err := db.RunCommand(ctx, command).Decode(&res); err != nil {
		return nil, err
	}
	return serializeDocument(res), nil
}

func (a *Adapter) UpdateDocument(ctx context.Context, database, collection string, filter, update map[string]any) (map[string]int64, error) {
	db := a.db(database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	res, err := db.Collection(collection).UpdateOne(ctx, sanitizeFilter(filter), bson.M{"$set": update})
	if err != nil {
		return nil, err
	}
	return map[string]int64{"matchedCount": res.MatchedCount, "modifiedCount": res.ModifiedCount}, nil
}

func (a *Adapter) DeleteDocument(ctx context.Context, database, collection string, filter map[string]any) (map[string]int64, error) {
	db := a.db(database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	res, err := db.Collection(collection).DeleteOne(ctx, sanitizeFilter(filter))
	if err != nil {
		return nil, err
	}
	return map[string]int64{"deletedCount": res.DeletedCount}, nil
}

// AggregateInput mirrors the aggregate route schema.
type AggregateInput struct {
	Collection string           `json:"collection"`
	Database   string           `json:"database,omitempty"`
	Pipeline   []map[string]any `json:"pipeline"`
	Limit      int64            `json:"limit,omitempty"`
	Skip       int64            `json:"skip,omitempty"`
	RequestID  *string          `json:"requestId,omitempty"`
}

type MongoCommandRequest struct {
	Database  string         `json:"database,omitempty"`
	Command   map[string]any `json:"command"`
	RequestID *string        `json:"requestId,omitempty"`
}

func (a *Adapter) Aggregate(ctx context.Context, in AggregateInput) (*DocumentResult, error) {
	start := time.Now()
	db := a.db(in.Database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	coll := db.Collection(in.Collection)

	pipeline := in.Pipeline
	if pipeline == nil {
		pipeline = []map[string]any{}
	}
	limit := in.Limit
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	final := append([]map[string]any{}, pipeline...)
	if in.Skip > 0 {
		final = append(final, map[string]any{"$skip": in.Skip})
	}
	hasLimit := false
	for _, st := range final {
		if _, ok := st["$limit"]; ok {
			hasLimit = true
		}
	}
	if !hasLimit {
		final = append(final, map[string]any{"$limit": limit + 1})
	}

	// Total count via $count pipeline minus existing $limit/$skip.
	countPipe := []any{}
	for _, st := range pipeline {
		if _, ok := st["$limit"]; ok {
			continue
		}
		if _, ok := st["$skip"]; ok {
			continue
		}
		countPipe = append(countPipe, st)
	}
	countPipe = append(countPipe, bson.M{"$count": "total"}, bson.M{"$limit": 10001})
	countCursor, err := coll.Aggregate(ctx, countPipe)
	if err != nil {
		return nil, err
	}
	var countDocs []bson.M
	if err := countCursor.All(ctx, &countDocs); err != nil {
		return nil, err
	}
	var total int64
	if len(countDocs) > 0 {
		if v, ok := countDocs[0]["total"].(int32); ok {
			total = int64(v)
		} else if v, ok := countDocs[0]["total"].(int64); ok {
			total = v
		}
	}

	cursor, err := coll.Aggregate(ctx, final)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	documents := []map[string]any{}
	hasMore := false
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		if int64(len(documents)) < limit {
			documents = append(documents, serializeDocument(doc))
		} else {
			hasMore = true
		}
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}
	return &DocumentResult{
		Documents:  documents,
		TotalCount: total,
		HasMore:    hasMore,
		DurationMs: time.Since(start).Milliseconds(),
	}, nil
}

// BoundedFindInput / BoundedAggregateInput mirror the MCP types.
type BoundedFindInput struct {
	Collection string           `json:"collection"`
	Database   string           `json:"database,omitempty"`
	Filter     map[string]any   `json:"filter,omitempty"`
	Projection map[string]any   `json:"projection,omitempty"`
	Sort       map[string]int32 `json:"sort,omitempty"`
	Skip       int64            `json:"skip,omitempty"`
	Limit      int64            `json:"limit"`
}

type BoundedAggregateInput struct {
	Collection string           `json:"collection"`
	Database   string           `json:"database,omitempty"`
	Pipeline   []map[string]any `json:"pipeline"`
	MaxRows    int64            `json:"maxRows"`
}

type BoundedResult struct {
	Documents  []map[string]any `json:"documents"`
	DurationMs int64            `json:"durationMs"`
	Truncated  bool             `json:"truncated"`
}

// FindBounded is the MCP read: limit+1 docs, bounded deadline, no count
// query. Driver v2 dropped per-op maxTimeMS — a ctx deadline is the CSOT
// equivalent.
func (a *Adapter) FindBounded(ctx context.Context, in BoundedFindInput) (*BoundedResult, error) {
	start := time.Now()
	db := a.db(in.Database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	limit := in.Limit
	if limit < 1 {
		limit = 1
	}
	ctx, cancel := context.WithTimeout(ctx, mcpQueryTimeout)
	defer cancel()
	opts := options.Find().
		SetSkip(in.Skip).
		SetLimit(limit + 1)
	if in.Projection != nil {
		opts.SetProjection(in.Projection)
	}
	if sd := sortDoc(in.Sort); sd != nil {
		opts.SetSort(sd)
	}
	filter := in.Filter
	if filter == nil {
		filter = map[string]any{}
	}
	cursor, err := db.Collection(in.Collection).Find(ctx, sanitizeFilter(filter), opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	documents := []map[string]any{}
	truncated := false
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		if int64(len(documents)) < limit {
			documents = append(documents, serializeDocument(doc))
		} else {
			truncated = true
			break
		}
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}
	return &BoundedResult{Documents: documents, DurationMs: time.Since(start).Milliseconds(), Truncated: truncated}, nil
}

// AggregateBounded is the MCP read: rejects $out/$merge, appends $limit.
func (a *Adapter) AggregateBounded(ctx context.Context, in BoundedAggregateInput) (*BoundedResult, error) {
	start := time.Now()
	if hasWritingStage(in.Pipeline) {
		return nil, errors.New("Aggregation stages that write ($out, $merge) are not allowed")
	}
	db := a.db(in.Database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	limit := in.MaxRows
	if limit < 1 {
		limit = 1
	}
	pipeline := append(append([]map[string]any{}, in.Pipeline...),
		map[string]any{"$limit": limit + 1})
	ctx, cancel := context.WithTimeout(ctx, mcpQueryTimeout)
	defer cancel()
	cursor, err := db.Collection(in.Collection).Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	documents := []map[string]any{}
	truncated := false
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		if int64(len(documents)) < limit {
			documents = append(documents, serializeDocument(doc))
		} else {
			truncated = true
			break
		}
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}
	return &BoundedResult{Documents: documents, DurationMs: time.Since(start).Milliseconds(), Truncated: truncated}, nil
}

// IndexSpec is one index inside CollectionStats.
type IndexSpec struct {
	Name   string         `json:"name"`
	Key    map[string]any `json:"key"`
	Unique bool           `json:"unique"`
}

type CollectionStats struct {
	DocumentCount int64       `json:"documentCount"`
	Indexes       []IndexSpec `json:"indexes"`
}

func (a *Adapter) GetCollectionStats(ctx context.Context, database, collection string) (*CollectionStats, error) {
	db := a.db(database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	coll := db.Collection(collection)
	count, err := coll.EstimatedDocumentCount(ctx)
	if err != nil {
		return nil, err
	}
	cursor, err := coll.Indexes().List(ctx)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	stats := &CollectionStats{DocumentCount: count}
	for cursor.Next(ctx) {
		var spec struct {
			Name   string         `bson:"name"`
			Key    map[string]any `bson:"key"`
			Unique *bool          `bson:"unique"`
		}
		if err := cursor.Decode(&spec); err != nil {
			return nil, err
		}
		if spec.Name == "" {
			continue
		}
		entry := IndexSpec{Name: spec.Name, Key: spec.Key}
		if spec.Unique != nil {
			entry.Unique = *spec.Unique
		}
		stats.Indexes = append(stats.Indexes, entry)
	}
	if stats.Indexes == nil {
		stats.Indexes = []IndexSpec{}
	}
	return stats, cursor.Err()
}

func (a *Adapter) Close(ctx context.Context) error {
	if a.client == nil {
		return nil
	}
	err := a.client.Disconnect(ctx)
	a.client = nil
	return err
}
