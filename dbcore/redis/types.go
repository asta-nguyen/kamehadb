package redis

type KeyEntry struct {
	Key  string `json:"key"`
	Type string `json:"type"`
	TTL  int64  `json:"ttl"`
}

type KeyPage struct {
	Keys         []KeyEntry `json:"keys"`
	NextCursor   string     `json:"nextCursor,omitempty"`
	Done         bool       `json:"done"`
	PayloadBytes int64      `json:"payloadBytes,omitempty"`
	LimitReason  string     `json:"limitReason,omitempty"`
}

type RedisValue struct {
	Key   string `json:"key"`
	Type  string `json:"type"`
	TTL   int64  `json:"ttl"`
	Value any    `json:"value"`
}

type ScanKeysInput struct {
	Pattern   string  `json:"pattern,omitempty"`
	Count     int64   `json:"count,omitempty"`
	Cursor    string  `json:"cursor,omitempty"`
	RequestID *string `json:"requestId,omitempty"`
	Scope     string  `json:"-"`
}

type RedisValuePageInput struct {
	Key       string  `json:"key"`
	Cursor    string  `json:"cursor,omitempty"`
	Limit     int64   `json:"limit,omitempty"`
	RequestID *string `json:"requestId,omitempty"`
	Scope     string  `json:"-"`
}

type RedisValuePage struct {
	Key          string `json:"key"`
	Type         string `json:"type"`
	TTL          int64  `json:"ttl"`
	Complete     bool   `json:"complete"`
	Value        any    `json:"value,omitempty"`
	NextCursor   string `json:"nextCursor,omitempty"`
	HasMore      bool   `json:"hasMore"`
	PayloadBytes int64  `json:"payloadBytes,omitempty"`
	LimitReason  string `json:"limitReason,omitempty"`
	DurationMs   int64  `json:"durationMs"`
}

type RedisCommandRequest struct {
	Command   string  `json:"command"`
	RequestID *string `json:"requestId,omitempty"`
}

type RedisKeyRequest struct {
	Key       string  `json:"key"`
	RequestID *string `json:"requestId,omitempty"`
}

type RedisStats struct {
	Version          string   `json:"version"`
	ConnectedClients int64    `json:"connectedClients"`
	BlockedClients   int64    `json:"blockedClients"`
	TotalConnections int64    `json:"totalConnections"`
	TotalCommands    int64    `json:"totalCommands"`
	UsedMemory       int64    `json:"usedMemory"`
	UsedMemoryPeak   int64    `json:"usedMemoryPeak"`
	MaxMemory        *int64   `json:"maxMemory,omitempty"`
	TotalKeys        int64    `json:"totalKeys"`
	ExpiringKeys     int64    `json:"expiringKeys"`
	AvgTTL           int64    `json:"avgTtl"`
	UptimeSeconds    int64    `json:"uptimeSeconds"`
	HitRate          *float64 `json:"hitRate,omitempty"`
}

type CommandResult struct {
	Result     any    `json:"result"`
	Command    string `json:"command"`
	DurationMs int64  `json:"durationMs"`
}
