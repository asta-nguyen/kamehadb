// Package mongo ports adapters/mongodb.ts on mongo-driver/v2, including
// the MCP bounded read extensions and the mongosh resolution helpers.
package mongo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
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
// instead of executing operators. It also normalizes _id hex strings to match
// both BSON ObjectID and string representations so document updates and deletes
// succeed when the frontend passes a serialized hex _id. (How / Why / What)
func sanitizeFilter(filter map[string]any) map[string]any {
	out := make(map[string]any, len(filter))
	for k, v := range filter {
		if k == "_id" {
			if s, ok := v.(string); ok && len(s) == 24 {
				if oid, err := bson.ObjectIDFromHex(s); err == nil {
					out[k] = bson.M{"$in": []any{oid, s}}
					continue
				}
			}
			if m, ok := v.(map[string]any); ok {
				if oidStr, ok := m["$oid"].(string); ok && len(oidStr) == 24 {
					if oid, err := bson.ObjectIDFromHex(oidStr); err == nil {
						out[k] = bson.M{"$in": []any{oid, oidStr}}
						continue
					}
				}
			}
		}
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
type (
	TestConnectionResult = engines.TestConnectionResult
	DatabaseInfo         = engines.DatabaseInfo
)

// CollectionInfo mirrors the shared CollectionInfo.

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

const maxJSONSafeInteger = 9007199254740991

// countJSONValue keeps large counts lossless: values outside the float64-safe
// range cross the bridge as decimal strings instead of rounded numbers.
func countJSONValue(n int64) any {
	if n > maxJSONSafeInteger || n < -maxJSONSafeInteger {
		return strconv.FormatInt(n, 10)
	}
	return n
}

// validatePaging rejects input that would silently turn into a different or
// unbounded read. A zero Limit means unset and falls back to the default.
func validatePaging(skip, limit int64) error {
	if skip < 0 {
		return errors.New("skip must not be negative")
	}
	if limit < 0 {
		return errors.New("limit must be positive")
	}
	return nil
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

// sortSpec returns the sort document to send. The legacy Sort map has already
// lost the user's key order, so its keys are sorted: deterministic, but not the
// priority the user typed. SortJSON keeps the typed order.
func findSortSpec(in FindDocumentsInput) (bson.D, error) {
	if in.SortJSON != "" {
		spec, err := ParseOrderedDocument(in.SortJSON)
		if err != nil {
			return nil, fmt.Errorf("invalid sortJson: %w", err)
		}
		return spec, nil
	}
	return sortDoc(in.Sort), nil
}

// effectiveFilter combines the sanitized filter with the sample-based text
// search so document pages and explicit counts read the same set. A failed
// sample read degrades to the plain filter exactly like the browse path.
func (a *Adapter) effectiveFilter(ctx context.Context, coll *mongo.Collection, filter map[string]any, search string) map[string]any {
	if filter == nil {
		filter = map[string]any{}
	}
	queryFilter := sanitizeFilter(filter)
	if search == "" {
		return queryFilter
	}
	var sample bson.M
	if err := coll.FindOne(ctx, bson.M{}).Decode(&sample); err != nil || sample == nil {
		return queryFilter
	}
	var stringFields []string
	for k, v := range sample {
		if _, ok := v.(string); ok {
			stringFields = append(stringFields, k)
		}
	}
	if len(stringFields) == 0 {
		return queryFilter
	}
	regex := regexp.QuoteMeta(search)
	var orClauses []any
	for _, f := range stringFields {
		orClauses = append(orClauses, bson.M{f: bson.M{"$regex": regex, "$options": "i"}})
	}
	searchClause := bson.M{"$or": orClauses}
	if len(queryFilter) > 0 {
		return map[string]any{"$and": []any{queryFilter, searchClause}}
	}
	return searchClause
}

func (a *Adapter) FindDocuments(ctx context.Context, in FindDocumentsInput) (*DocumentResult, error) {
	start := time.Now()
	if err := validatePaging(in.Skip, in.Limit); err != nil {
		return nil, err
	}
	db := a.db(in.Database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	coll := db.Collection(in.Collection)

	queryFilter := a.effectiveFilter(ctx, coll, in.Filter, in.Search)

	limit := in.Limit
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	opts := options.Find().SetSkip(in.Skip).SetLimit(limit + 1)
	if in.Projection != nil {
		opts.SetProjection(in.Projection)
	}
	sortSpec, err := findSortSpec(in)
	if err != nil {
		return nil, err
	}
	if len(sortSpec) > 0 {
		opts.SetSort(sortSpec)
	}
	cursor, err := coll.Find(ctx, queryFilter, opts)
	if err != nil {
		return nil, err
	}
	// Kill the server cursor even after the request context is cancelled;
	// otherwise a cancelled browse leaves the cursor to the server timeout.
	defer cursor.Close(context.WithoutCancel(ctx))

	documents := []map[string]any{}
	hasMore := false
	var payloadBytes int64 = 2
	limitReason := ""
	i := int64(0)
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		serialized := serializeDocument(doc)
		encoded, err := json.Marshal(serialized)
		if err != nil {
			return nil, fmt.Errorf("document is not JSON-serializable: %w", err)
		}
		if payloadBytes+int64(len(encoded))+1 > engines.MaxPreviewResultBytes {
			if len(documents) == 0 {
				return nil, fmt.Errorf("first MongoDB document exceeds the %d-byte browse limit; project fewer fields or use a smaller collection", engines.MaxPreviewResultBytes)
			}
			hasMore = true
			limitReason = engines.LimitReasonBytes
			break
		}
		if i >= limit {
			hasMore = true
			limitReason = engines.LimitReasonRows
			break
		}
		documents = append(documents, serialized)
		payloadBytes += int64(len(encoded)) + 1
		i++
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}
	return &DocumentResult{
		Documents:    documents,
		HasMore:      hasMore,
		PayloadBytes: payloadBytes,
		LimitReason:  limitReason,
		CountMode:    "unknown",
		DurationMs:   time.Since(start).Milliseconds(),
	}, nil
}

// CountDocumentsInput drives the explicit count request. It shares the find
// filter/search but no paging: a count is all-or-nothing for that set.

// CountDocuments is the only count the GUI runs, and only on request. An
// estimate on a filtered set would silently scan the whole collection, so it
// is rejected instead of quietly becoming exact.
func (a *Adapter) CountDocuments(ctx context.Context, in CountDocumentsInput) (*CountResult, error) {
	start := time.Now()
	db := a.db(in.Database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	coll := db.Collection(in.Collection)
	switch in.Mode {
	case "estimated":
		if len(in.Filter) > 0 || in.Search != "" {
			return nil, errors.New("estimated count requires no filter or search; run an exact count instead")
		}
		n, err := coll.EstimatedDocumentCount(ctx)
		if err != nil {
			return nil, err
		}
		return &CountResult{Count: countJSONValue(n), CountMode: "estimated", DurationMs: time.Since(start).Milliseconds()}, nil
	case "exact":
		filter := a.effectiveFilter(ctx, coll, in.Filter, in.Search)
		n, err := coll.CountDocuments(ctx, filter)
		if err != nil {
			return nil, err
		}
		return &CountResult{Count: countJSONValue(n), CountMode: "exact", DurationMs: time.Since(start).Milliseconds()}, nil
	default:
		return nil, errors.New(`count mode must be "estimated" or "exact"`)
	}
}

// RunCommand sends command as-is. MongoDB reads the first field as the command
// name, so callers pass a bson.D (see MongoCommandRequest.Document).
func (a *Adapter) RunCommand(ctx context.Context, database string, command any) (any, error) {
	db := a.db(database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	var res bson.M
	if err := db.RunCommand(ctx, command).Decode(&res); err != nil {
		return nil, err
	}
	serialized := serializeDocument(res)
	encoded, err := json.Marshal(serialized)
	if err != nil {
		return nil, fmt.Errorf("command response is not JSON-serializable: %w", err)
	}
	// The command already ran; its reply is just too big to ship. Say so rather
	// than clipping a possibly-written result into something it was not.
	if int64(len(encoded)) > engines.MaxGUIResultBytes {
		return nil, fmt.Errorf("Mongo command response exceeds the %d-byte limit; it may already have executed — do not replay it automatically", engines.MaxGUIResultBytes)
	}
	return serialized, nil
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

type MongoCommandRequest struct {
	Database string         `json:"database,omitempty"`
	Command  map[string]any `json:"command,omitempty"`
	// CommandJSON is the command as JSON text. It wins over Command because a Go
	// map cannot keep the command name first or a compound index key in order.
	CommandJSON string  `json:"commandJson,omitempty"`
	RequestID   *string `json:"requestId,omitempty"`
}

// Document returns the command to send: ordered when CommandJSON is set, else the
// legacy map unchanged.
func (r MongoCommandRequest) Document() (any, error) {
	if r.CommandJSON == "" {
		return r.Command, nil
	}
	command, err := ParseOrderedDocument(r.CommandJSON)
	if err != nil {
		return nil, fmt.Errorf("invalid commandJson: %w", err)
	}
	return command, nil
}

// stages returns the pipeline to run. The legacy Pipeline maps have already lost
// the key order inside each stage, so those keys are sorted: deterministic, but
// not the order the user typed. PipelineJSON keeps it.
func aggregateStages(in AggregateInput) ([]bson.D, error) {
	if in.PipelineJSON != "" {
		stages, err := ParseOrderedPipeline(in.PipelineJSON)
		if err != nil {
			return nil, fmt.Errorf("invalid pipelineJson: %w", err)
		}
		return stages, nil
	}
	stages := make([]bson.D, len(in.Pipeline))
	for i, stage := range in.Pipeline {
		keys := make([]string, 0, len(stage))
		for key := range stage {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		doc := make(bson.D, len(keys))
		for j, key := range keys {
			doc[j] = bson.E{Key: key, Value: stage[key]}
		}
		stages[i] = doc
	}
	return stages, nil
}

// stageHas reports whether a stage uses the given operator, for example "$limit".
func stageHas(stage bson.D, operator string) bool {
	for _, field := range stage {
		if field.Key == operator {
			return true
		}
	}
	return false
}

// buildAggregatePipelines derives the page pipeline one GUI aggregation runs:
// the stages plus the requested skip and a one-extra-row limit so hasMore can
// be known, unless the user already set a $limit. Counts are never pipelined.
func buildAggregatePipelines(stages []bson.D, skip, limit int64) []bson.D {
	page := append([]bson.D{}, stages...)
	if skip > 0 {
		page = append(page, bson.D{{Key: "$skip", Value: skip}})
	}
	hasLimit := false
	for _, stage := range page {
		if stageHas(stage, "$limit") {
			hasLimit = true
		}
	}
	if !hasLimit {
		page = append(page, bson.D{{Key: "$limit", Value: limit + 1}})
	}
	return page
}

// hasWritingStageD is the ordered-pipeline form of hasWritingStage.
func hasWritingStageD(stages []bson.D) bool {
	for _, stage := range stages {
		if stageHas(stage, "$out") || stageHas(stage, "$merge") {
			return true
		}
	}
	return false
}

func (a *Adapter) Aggregate(ctx context.Context, in AggregateInput) (*DocumentResult, error) {
	start := time.Now()
	if err := validatePaging(in.Skip, in.Limit); err != nil {
		return nil, err
	}
	db := a.db(in.Database)
	if db == nil {
		return nil, errors.New("No database selected")
	}
	coll := db.Collection(in.Collection)

	stages, err := aggregateStages(in)
	if err != nil {
		return nil, err
	}
	limit := in.Limit
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	// A pipeline with a terminal write runs exactly once, unmodified: appended
	// $skip/$limit after $out/$merge would be invalid or change its meaning.
	page := stages
	if !hasWritingStageD(stages) {
		page = buildAggregatePipelines(stages, in.Skip, limit)
	}
	cursor, err := coll.Aggregate(ctx, page)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(context.WithoutCancel(ctx))
	documents := []map[string]any{}
	hasMore := false
	var payloadBytes int64 = 2
	limitReason := ""
	i := int64(0)
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		serialized := serializeDocument(doc)
		encoded, err := json.Marshal(serialized)
		if err != nil {
			return nil, fmt.Errorf("document is not JSON-serializable: %w", err)
		}
		if payloadBytes+int64(len(encoded))+1 > engines.MaxPreviewResultBytes {
			if len(documents) == 0 {
				return nil, fmt.Errorf("first MongoDB document exceeds the %d-byte browse limit; project fewer fields or use a smaller collection", engines.MaxPreviewResultBytes)
			}
			hasMore = true
			limitReason = engines.LimitReasonBytes
			break
		}
		if i >= limit {
			hasMore = true
			limitReason = engines.LimitReasonRows
			break
		}
		documents = append(documents, serialized)
		payloadBytes += int64(len(encoded)) + 1
		i++
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}
	return &DocumentResult{
		Documents:    documents,
		HasMore:      hasMore,
		PayloadBytes: payloadBytes,
		LimitReason:  limitReason,
		CountMode:    "unknown",
		DurationMs:   time.Since(start).Milliseconds(),
	}, nil
}

// BoundedFindInput / BoundedAggregateInput mirror the MCP types.

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
