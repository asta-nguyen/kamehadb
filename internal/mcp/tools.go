package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	mongoadapter "github.com/asta-nguyen/kamehadb/internal/mongo"
	"github.com/asta-nguyen/kamehadb/internal/sqlsafety"
)

// toolDef is the tools/list shape — name, description, JSON-Schema args.
type toolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

type toolHandler func(ctx context.Context, args map[string]any) (any, error)

// capItems applies the metadata list cap and reports truncation.
func capItems[T any](items []T) ([]T, bool) {
	if len(items) <= MaxMetadataItems {
		return items, false
	}
	return items[:MaxMetadataItems], true
}

func requireSQL(c *Connection) (SqlRead, error) {
	if c.Kind != "sql" || c.SQL == nil {
		return nil, newToolError(ErrInvalidArguments, "This tool requires a SQL connection")
	}
	return c.SQL, nil
}

func requireMongo(c *Connection) (MongoRead, error) {
	if c.Kind != "mongo" || c.Mongo == nil {
		return nil, newToolError(ErrInvalidArguments, "This tool requires a MongoDB connection")
	}
	return c.Mongo, nil
}

func strArg(args map[string]any, key string) string {
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}

func strPtrArg(args map[string]any, key string) *string {
	if v, ok := args[key].(string); ok && v != "" {
		return &v
	}
	return nil
}

func intArg(args map[string]any, key string) (int64, bool) {
	switch v := args[key].(type) {
	case float64:
		return int64(v), true
	case int64:
		return v, true
	}
	return 0, false
}

func clampRows(v int64, ok bool, fallback int64) int64 {
	if !ok || v < 1 {
		return fallback
	}
	if v > MaxRowLimit {
		return MaxRowLimit
	}
	return v
}

var (
	connIDSchema    = map[string]any{"type": "string", "minLength": 1, "description": "Connection profile id"}
	dbOptSchema     = map[string]any{"type": "string", "minLength": 1}
	schemaOptSchema = map[string]any{"type": "string", "minLength": 1}
	maxRowsSchema   = map[string]any{"type": "integer", "minimum": 1, "maximum": MaxRowLimit}
)

func objectSchema(props map[string]any, required []string) map[string]any {
	return map[string]any{"type": "object", "properties": props, "required": required}
}

// tools is the registered read-only tool set — registerMcpTools.
func (s *serverState) tools() []toolDef {
	return []toolDef{
		{
			Name:        "list_mcp_profiles",
			Description: "List connection profiles enabled for read-only MCP access. Never returns credentials.",
			InputSchema: objectSchema(map[string]any{}, []string{}),
		},
		{
			Name:        "sql_list_databases",
			Description: "List databases on an MCP-enabled SQL connection.",
			InputSchema: objectSchema(map[string]any{"connection_id": connIDSchema}, []string{"connection_id"}),
		},
		{
			Name:        "sql_list_schemas",
			Description: "List schemas on an MCP-enabled SQL connection.",
			InputSchema: objectSchema(map[string]any{"connection_id": connIDSchema, "database": dbOptSchema}, []string{"connection_id"}),
		},
		{
			Name:        "sql_list_tables",
			Description: "List tables on an MCP-enabled SQL connection.",
			InputSchema: objectSchema(map[string]any{"connection_id": connIDSchema, "database": dbOptSchema, "schema": schemaOptSchema}, []string{"connection_id"}),
		},
		{
			Name:        "sql_describe_table",
			Description: "Return column names and types for a table on an MCP-enabled SQL connection.",
			InputSchema: objectSchema(map[string]any{"connection_id": connIDSchema, "table": map[string]any{"type": "string", "minLength": 1}, "database": dbOptSchema, "schema": schemaOptSchema}, []string{"connection_id", "table"}),
		},
		{
			Name:        "sql_query",
			Description: "Run one read-only SQL statement and return a bounded result.",
			InputSchema: objectSchema(map[string]any{"connection_id": connIDSchema, "sql": map[string]any{"type": "string", "minLength": 1}, "max_rows": maxRowsSchema}, []string{"connection_id", "sql"}),
		},
		{
			Name:        "mongo_list_databases",
			Description: "List databases on an MCP-enabled MongoDB connection.",
			InputSchema: objectSchema(map[string]any{"connection_id": connIDSchema}, []string{"connection_id"}),
		},
		{
			Name:        "mongo_list_collections",
			Description: "List collections in a MongoDB database.",
			InputSchema: objectSchema(map[string]any{"connection_id": connIDSchema, "database": dbOptSchema}, []string{"connection_id", "database"}),
		},
		{
			Name:        "mongo_find",
			Description: "Find documents with a bounded result set.",
			InputSchema: objectSchema(map[string]any{
				"connection_id": connIDSchema, "database": dbOptSchema, "collection": map[string]any{"type": "string", "minLength": 1},
				"filter": map[string]any{"type": "object"}, "projection": map[string]any{"type": "object"}, "sort": map[string]any{"type": "object"},
				"skip": map[string]any{"type": "integer", "minimum": 0, "maximum": MaxMongoSkip}, "limit": maxRowsSchema,
			}, []string{"connection_id", "database", "collection"}),
		},
		{
			Name:        "mongo_aggregate",
			Description: "Run a read-only aggregation pipeline. Writing stages are rejected.",
			InputSchema: objectSchema(map[string]any{
				"connection_id": connIDSchema, "database": dbOptSchema, "collection": map[string]any{"type": "string", "minLength": 1},
				"pipeline": map[string]any{"type": "array", "items": map[string]any{"type": "object"}}, "max_rows": maxRowsSchema,
			}, []string{"connection_id", "database", "collection", "pipeline"}),
		},
	}
}

func (s *serverState) dispatch(name string) toolHandler {
	switch name {
	case "list_mcp_profiles":
		return s.toolListProfiles
	case "sql_list_databases":
		return s.toolSQLListDatabases
	case "sql_list_schemas":
		return s.toolSQLListSchemas
	case "sql_list_tables":
		return s.toolSQLListTables
	case "sql_describe_table":
		return s.toolSQLDescribeTable
	case "sql_query":
		return s.toolSQLQuery
	case "mongo_list_databases":
		return s.toolMongoListDatabases
	case "mongo_list_collections":
		return s.toolMongoListCollections
	case "mongo_find":
		return s.toolMongoFind
	case "mongo_aggregate":
		return s.toolMongoAggregate
	}
	return nil
}

func (s *serverState) toolListProfiles(ctx context.Context, _ map[string]any) (any, error) {
	profiles, err := s.st.ListProfiles()
	if err != nil {
		return nil, err
	}
	// A scoped (ACP) token sees only its own profile, so the agent cannot
	// enumerate other enabled profiles. (Why)
	scope := scopeFromContext(ctx)
	out := []map[string]any{}
	for i := range profiles {
		p := &profiles[i]
		if scope != "" && p.ID != scope {
			continue
		}
		if !s.manager.CanServe(p) || !engines.IsMCPSupportedKind(p.Kind) {
			continue
		}
		out = append(out, map[string]any{
			"id": p.ID, "name": p.Name, "kind": p.Kind, "database": p.Database,
		})
	}
	return map[string]any{"profiles": out}, nil
}

func (s *serverState) toolSQLListDatabases(ctx context.Context, args map[string]any) (any, error) {
	return s.manager.WithConnection(ctx, strArg(args, "connection_id"), func(c *Connection) (any, error) {
		adapter, err := requireSQL(c)
		if err != nil {
			return nil, err
		}
		items, err := adapter.ListDatabases(ctx)
		if err != nil {
			return nil, err
		}
		capped, truncated := capItems(items)
		return map[string]any{"databases": capped, "truncated": truncated}, nil
	})
}

func (s *serverState) toolSQLListSchemas(ctx context.Context, args map[string]any) (any, error) {
	return s.manager.WithConnection(ctx, strArg(args, "connection_id"), func(c *Connection) (any, error) {
		adapter, err := requireSQL(c)
		if err != nil {
			return nil, err
		}
		database := strPtrArg(args, "database")
		if err := assertDatabaseScope(c.Profile.Database, database); err != nil {
			return nil, err
		}
		items, err := adapter.ListSchemas(ctx, database)
		if err != nil {
			return nil, err
		}
		capped, truncated := capItems(items)
		return map[string]any{"schemas": capped, "truncated": truncated}, nil
	})
}

func (s *serverState) toolSQLListTables(ctx context.Context, args map[string]any) (any, error) {
	return s.manager.WithConnection(ctx, strArg(args, "connection_id"), func(c *Connection) (any, error) {
		adapter, err := requireSQL(c)
		if err != nil {
			return nil, err
		}
		database := strPtrArg(args, "database")
		if err := assertDatabaseScope(c.Profile.Database, database); err != nil {
			return nil, err
		}
		items, err := adapter.ListTables(ctx, database, strPtrArg(args, "schema"))
		if err != nil {
			return nil, err
		}
		capped, truncated := capItems(items)
		return map[string]any{"tables": capped, "truncated": truncated}, nil
	})
}

func (s *serverState) toolSQLDescribeTable(ctx context.Context, args map[string]any) (any, error) {
	return s.manager.WithConnection(ctx, strArg(args, "connection_id"), func(c *Connection) (any, error) {
		adapter, err := requireSQL(c)
		if err != nil {
			return nil, err
		}
		database := strPtrArg(args, "database")
		if err := assertDatabaseScope(c.Profile.Database, database); err != nil {
			return nil, err
		}
		items, err := adapter.GetTableColumns(ctx, strArg(args, "table"), database, strPtrArg(args, "schema"))
		if err != nil {
			return nil, err
		}
		capped, truncated := capItems(items)
		return map[string]any{"columns": capped, "truncated": truncated}, nil
	})
}

func (s *serverState) toolSQLQuery(ctx context.Context, args map[string]any) (any, error) {
	query := strArg(args, "sql")
	if safe, reason := sqlsafety.Check(query); !safe {
		return nil, newToolError(ErrReadOnlyQueryRequired, reason)
	}
	return s.manager.WithConnection(ctx, strArg(args, "connection_id"), func(c *Connection) (any, error) {
		adapter, err := requireSQL(c)
		if err != nil {
			return nil, err
		}
		maxRows, ok := intArg(args, "max_rows")
		result, err := adapter.RunQueryBounded(ctx, engines.BoundedQueryInput{
			Query:   query,
			MaxRows: clampRows(maxRows, ok, DefaultRowLimit),
		})
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"columns": result.Columns, "rows": result.Rows,
			"duration_ms": result.DurationMs, "truncated": result.Truncated,
		}, nil
	})
}

func (s *serverState) toolMongoListDatabases(ctx context.Context, args map[string]any) (any, error) {
	return s.manager.WithConnection(ctx, strArg(args, "connection_id"), func(c *Connection) (any, error) {
		adapter, err := requireMongo(c)
		if err != nil {
			return nil, err
		}
		items, err := adapter.ListDatabases(ctx)
		if err != nil {
			return nil, err
		}
		capped, truncated := capItems(items)
		return map[string]any{"databases": capped, "truncated": truncated}, nil
	})
}

func (s *serverState) toolMongoListCollections(ctx context.Context, args map[string]any) (any, error) {
	return s.manager.WithConnection(ctx, strArg(args, "connection_id"), func(c *Connection) (any, error) {
		adapter, err := requireMongo(c)
		if err != nil {
			return nil, err
		}
		database := strArg(args, "database")
		if err := assertDatabaseScope(c.Profile.Database, &database); err != nil {
			return nil, err
		}
		items, err := adapter.ListCollections(ctx, database)
		if err != nil {
			return nil, err
		}
		capped, truncated := capItems(items)
		return map[string]any{"collections": capped, "truncated": truncated}, nil
	})
}

func mapArg(args map[string]any, key string) map[string]any {
	if v, ok := args[key].(map[string]any); ok {
		return v
	}
	return nil
}

func (s *serverState) toolMongoFind(ctx context.Context, args map[string]any) (any, error) {
	return s.manager.WithConnection(ctx, strArg(args, "connection_id"), func(c *Connection) (any, error) {
		adapter, err := requireMongo(c)
		if err != nil {
			return nil, err
		}
		database := strArg(args, "database")
		if err := assertDatabaseScope(c.Profile.Database, &database); err != nil {
			return nil, err
		}
		skip, _ := intArg(args, "skip")
		if skip > MaxMongoSkip {
			skip = MaxMongoSkip
		}
		limit, ok := intArg(args, "limit")
		result, err := adapter.FindBounded(ctx, mongoadapter.BoundedFindInput{
			Database:   database,
			Collection: strArg(args, "collection"),
			Filter:     mapArg(args, "filter"),
			Projection: mapArg(args, "projection"),
			Sort:       intSortMap(mapArg(args, "sort")),
			Skip:       skip,
			Limit:      clampRows(limit, ok, DefaultRowLimit),
		})
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"documents": result.Documents, "duration_ms": result.DurationMs, "truncated": result.Truncated,
		}, nil
	})
}

// intSortMap coerces JSON sort values to int32 — mongo.Sort is map[string]int32.
func intSortMap(m map[string]any) map[string]int32 {
	if m == nil {
		return nil
	}
	out := make(map[string]int32, len(m))
	for k, v := range m {
		if f, ok := v.(float64); ok {
			out[k] = int32(f)
		}
	}
	return out
}

func (s *serverState) toolMongoAggregate(ctx context.Context, args map[string]any) (any, error) {
	return s.manager.WithConnection(ctx, strArg(args, "connection_id"), func(c *Connection) (any, error) {
		adapter, err := requireMongo(c)
		if err != nil {
			return nil, err
		}
		database := strArg(args, "database")
		if err := assertDatabaseScope(c.Profile.Database, &database); err != nil {
			return nil, err
		}
		var pipeline []map[string]any
		if raw, ok := args["pipeline"].([]any); ok {
			pipeline = make([]map[string]any, 0, len(raw))
			for _, stage := range raw {
				if m, ok := stage.(map[string]any); ok {
					pipeline = append(pipeline, m)
				}
			}
		}
		maxRows, ok := intArg(args, "max_rows")
		result, err := adapter.AggregateBounded(ctx, mongoadapter.BoundedAggregateInput{
			Database:   database,
			Collection: strArg(args, "collection"),
			Pipeline:   pipeline,
			MaxRows:    clampRows(maxRows, ok, DefaultRowLimit),
		})
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"documents": result.Documents, "duration_ms": result.DurationMs, "truncated": result.Truncated,
		}, nil
	})
}

// callResult is the MCP tool result envelope — errors come back as isError
// content, never as JSON-RPC errors.
type callResult struct {
	Content []map[string]any `json:"content"`
	IsError bool             `json:"isError,omitempty"`
}

func jsonContent(payload any) *callResult {
	raw, err := json.Marshal(payload)
	if err != nil {
		raw = []byte(fmt.Sprintf("%v", payload))
	}
	return &callResult{Content: []map[string]any{{"type": "text", "text": string(raw)}}}
}

func errorContent(err error) *callResult {
	return &callResult{
		Content: []map[string]any{{"type": "text", "text": ToToolError(err).Error()}},
		IsError: true,
	}
}
