package mongo

type CollectionInfo struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	DocumentCount *int64 `json:"documentCount,omitempty"`
}

type FindDocumentsInput struct {
	Collection string           `json:"collection"`
	Database   string           `json:"database,omitempty"`
	Filter     map[string]any   `json:"filter,omitempty"`
	Projection map[string]any   `json:"projection,omitempty"`
	Sort       map[string]int32 `json:"sort,omitempty"`
	// SortJSON is the sort document as JSON text. It wins over Sort because a Go
	// map cannot keep the key order a compound sort depends on.
	SortJSON  string  `json:"sortJson,omitempty"`
	Skip      int64   `json:"skip,omitempty"`
	Limit     int64   `json:"limit,omitempty"`
	Search    string  `json:"search,omitempty"`
	RequestID *string `json:"requestId,omitempty"`
}

type DocumentResult struct {
	Documents []map[string]any `json:"documents"`
	// TotalCount is a safe number or an exact decimal string; counts beyond
	// float64 must not round-trip through a JavaScript number.
	TotalCount   any    `json:"totalCount,omitempty"`
	CountMode    string `json:"countMode,omitempty"`
	HasMore      bool   `json:"hasMore"`
	PayloadBytes int64  `json:"payloadBytes,omitempty"`
	LimitReason  string `json:"limitReason,omitempty"`
	DurationMs   int64  `json:"durationMs"`
}

type CountDocumentsInput struct {
	Collection string         `json:"collection"`
	Database   string         `json:"database,omitempty"`
	Filter     map[string]any `json:"filter,omitempty"`
	Search     string         `json:"search,omitempty"`
	Mode       string         `json:"mode"`
	RequestID  *string        `json:"requestId,omitempty"`
}

type CountResult struct {
	Count      any    `json:"count"`
	CountMode  string `json:"countMode"`
	DurationMs int64  `json:"durationMs"`
}

type AggregateInput struct {
	Collection string           `json:"collection"`
	Database   string           `json:"database,omitempty"`
	Pipeline   []map[string]any `json:"pipeline,omitempty"`
	// PipelineJSON is the pipeline as JSON text. It wins over Pipeline because a
	// Go map cannot keep the key order a compound $sort depends on.
	PipelineJSON string  `json:"pipelineJson,omitempty"`
	Limit        int64   `json:"limit,omitempty"`
	Skip         int64   `json:"skip,omitempty"`
	RequestID    *string `json:"requestId,omitempty"`
}

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

type IndexSpec struct {
	Name   string         `json:"name"`
	Key    map[string]any `json:"key"`
	Unique bool           `json:"unique"`
}

type CollectionStats struct {
	DocumentCount int64       `json:"documentCount"`
	Indexes       []IndexSpec `json:"indexes"`
}
