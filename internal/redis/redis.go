// Package redis ports adapters/redis.ts on go-redis/v9.
package redis

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	goredis "github.com/redis/go-redis/v9"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const (
	testConnectTimeout = 3 * time.Second
	connectTimeout     = 5 * time.Second
	defaultHost        = "localhost"
)

type Config struct {
	Host     string
	Port     int64
	Password string
	Database int
}

func newClient(cfg Config, dialTimeout time.Duration, noRetry bool) *goredis.Client {
	host := cfg.Host
	if host == "" {
		host = defaultHost
	}
	port := cfg.Port
	if port == 0 {
		port = int64(engines.DefaultPorts[engines.KindRedis])
	}
	maxRetries := 3
	if noRetry {
		maxRetries = -1 // fail fast, like retryStrategy: () => null
	}
	return goredis.NewClient(&goredis.Options{
		Addr:        fmt.Sprintf("%s:%d", host, port),
		Password:    cfg.Password,
		DB:          cfg.Database,
		DialTimeout: dialTimeout,
		MaxRetries:  maxRetries,
		// go-redis v9 negotiates RESP3 by default, which turns HGETALL, CONFIG GET
		// and XINFO replies into map[interface{}]interface{}: JSON cannot encode
		// that, so raw command results would never reach the UI. RESP2 keeps the
		// flat-array replies the previous ioredis-based sidecar produced.
		Protocol:              2,
		ContextTimeoutEnabled: true,
	})
}

type Adapter struct {
	cfg    Config
	client *goredis.Client
}

func New(cfg Config) *Adapter {
	// Ambiguous command failures must never replay a possibly completed write.
	return &Adapter{cfg: cfg, client: newClient(cfg, connectTimeout, true)}
}

// A GUI request gets its own pool: cancellation closes only that request's
// sockets, including blocking commands, never another tab's shared client.
func (a *Adapter) ForRequest(ctx context.Context) (*Adapter, func()) {
	owned := New(a.cfg)
	stop := context.AfterFunc(ctx, func() { _ = owned.client.Close() })
	return owned, func() { stop(); _ = owned.client.Close() }
}

type TestConnectionResult = engines.TestConnectionResult

// KeyEntry / KeyPage / RedisValue mirror the shared redis types.
type KeyEntry struct {
	Key  string `json:"key"`
	Type string `json:"type"`
	TTL  int64  `json:"ttl"`
}

type KeyPage struct {
	Keys   []KeyEntry `json:"keys"`
	Cursor int64      `json:"cursor"`
	Done   bool       `json:"done"`
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
	Cursor    int64   `json:"cursor,omitempty"`
	RequestID *string `json:"requestId,omitempty"`
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

func (a *Adapter) TestConnection(ctx context.Context) (*TestConnectionResult, error) {
	if err := a.client.Ping(ctx).Err(); err != nil {
		return &TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	info, err := a.client.Info(ctx, "server").Result()
	if err != nil {
		return &TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	version := "Redis"
	if m := regexp.MustCompile(`redis_version:([\d.]+)`).FindStringSubmatch(info); len(m) > 1 {
		version = "Redis " + m[1]
	}
	return &TestConnectionResult{Success: true, ServerVersion: version}, nil
}

func (a *Adapter) ScanKeys(ctx context.Context, in ScanKeysInput) (*KeyPage, error) {
	pattern := in.Pattern
	if pattern == "" {
		pattern = "*"
	}
	count := in.Count
	if count <= 0 {
		count = 100
	}
	keys, next, err := a.client.Scan(ctx, uint64(in.Cursor), pattern, count).Result()
	if err != nil {
		return nil, err
	}
	entries := make([]KeyEntry, 0, len(keys))
	for _, key := range keys {
		typ, err := a.client.Type(ctx, key).Result()
		if err != nil {
			return nil, err
		}
		ttl, err := a.client.TTL(ctx, key).Result()
		if err != nil {
			return nil, err
		}
		entries = append(entries, KeyEntry{Key: key, Type: typ, TTL: ttlSeconds(ttl)})
	}
	return &KeyPage{Keys: entries, Cursor: int64(next), Done: next == 0}, nil
}

// ttlSeconds converts the driver's Duration to ioredis semantics: -1
// (no expiry) and -2 (missing key) pass through, positive values → seconds.
func ttlSeconds(d time.Duration) int64 {
	if d <= 0 {
		return int64(d)
	}
	return int64(d / time.Second)
}

// getKeyDetails mirrors the TS per-type fetch + optional MEMORY USAGE.
func (a *Adapter) getKeyDetails(ctx context.Context, key string) (string, any, int64, error) {
	typ, err := a.client.Type(ctx, key).Result()
	if err != nil {
		return "", nil, 0, err
	}
	ttl, err := a.client.TTL(ctx, key).Result()
	if err != nil {
		return "", nil, 0, err
	}
	var value any
	switch typ {
	case "string":
		v, err := a.client.Get(ctx, key).Result()
		if err == goredis.Nil {
			v = ""
		} else if err != nil {
			return "", nil, 0, err
		}
		value = v
	case "list":
		value, err = a.client.LRange(ctx, key, 0, -1).Result()
	case "set":
		value, err = a.client.SMembers(ctx, key).Result()
	case "zset":
		value, err = a.client.ZRangeWithScores(ctx, key, 0, -1).Result()
	case "hash":
		value, err = a.client.HGetAll(ctx, key).Result()
	}
	if err != nil {
		return "", nil, 0, err
	}
	return typ, value, ttlSeconds(ttl), nil
}

func (a *Adapter) GetKey(ctx context.Context, key string) (*RedisValue, error) {
	typ, value, ttl, err := a.getKeyDetails(ctx, key)
	if err != nil {
		return nil, err
	}
	return &RedisValue{Key: key, Type: typ, TTL: ttl, Value: value}, nil
}

func (a *Adapter) GetTTL(ctx context.Context, key string) (int64, error) {
	ttl, err := a.client.TTL(ctx, key).Result()
	return ttlSeconds(ttl), err
}

var keyspaceLine = regexp.MustCompile(`^db(\d+):keys=(\d+),expires=(\d+),avg_ttl=(\d+)`)

// parseInfoSection returns the "key:value" lines under one "# Section" header of
// INFO output. RE2 has no lookahead, so the block is found by scanning lines: a
// "# " line starts a new section and only the requested one is collected. An
// exact header match keeps "Stats" from also reading "Commandstats".
func parseInfoSection(info, section string) map[string]string {
	out := map[string]string{}
	inSection := false
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)
		if name, isHeader := strings.CutPrefix(line, "# "); isHeader {
			inSection = name == section
			continue
		}
		if !inSection {
			continue
		}
		key, val, found := strings.Cut(line, ":")
		if found && key != "" {
			out[strings.TrimSpace(key)] = strings.TrimSpace(val)
		}
	}
	return out
}

func atoi(s string) int64 {
	n, _ := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	return n
}

func (a *Adapter) GetStats(ctx context.Context) (*RedisStats, error) {
	info, err := a.client.Info(ctx, "all").Result()
	if err != nil {
		return nil, err
	}
	server := parseInfoSection(info, "Server")
	clients := parseInfoSection(info, "Clients")
	memory := parseInfoSection(info, "Memory")
	stats := parseInfoSection(info, "Stats")

	var totalKeys, totalExpiring, avgTTL int64
	for _, line := range strings.Split(info, "\n") {
		if km := keyspaceLine.FindStringSubmatch(strings.TrimSpace(line)); len(km) == 5 {
			if atoi(km[1]) == int64(a.cfg.Database) {
				totalKeys += atoi(km[2])
				totalExpiring += atoi(km[3])
				if v := atoi(km[4]); v != 0 {
					avgTTL = v
				}
			}
		}
	}

	version := server["redis_version"]
	if version == "" {
		version = "unknown"
	}
	out := &RedisStats{
		Version:          version,
		ConnectedClients: atoi(clients["connected_clients"]),
		BlockedClients:   atoi(clients["blocked_clients"]),
		TotalConnections: atoi(stats["total_connections_received"]),
		TotalCommands:    atoi(stats["total_commands_processed"]),
		UsedMemory:       atoi(memory["used_memory"]),
		UsedMemoryPeak:   atoi(memory["used_memory_peak"]),
		TotalKeys:        totalKeys,
		ExpiringKeys:     totalExpiring,
		AvgTTL:           avgTTL,
		UptimeSeconds:    atoi(server["uptime_in_seconds"]),
	}
	if mm := memory["maxmemory"]; mm != "" {
		v := atoi(mm)
		out.MaxMemory = &v
	}
	if stats["keyspace_hits"] != "" && stats["keyspace_misses"] != "" {
		hits, misses := atoi(stats["keyspace_hits"]), atoi(stats["keyspace_misses"])
		if total := hits + misses; total > 0 {
			rate := float64(hits) / float64(total) * 100
			out.HitRate = &rate
		} else {
			zero := float64(0)
			out.HitRate = &zero
		}
	}
	return out, nil
}

var commandTokenizer = regexp.MustCompile(`(?:[^\s"']+|"[^"]*"|'[^']*')+`)

// RunCommand ports runCommand — same shell-ish tokenizer, then a raw call.
func (a *Adapter) RunCommand(ctx context.Context, command string) (*CommandResult, error) {
	trimmed := strings.TrimSpace(command)
	parts := commandTokenizer.FindAllString(trimmed, -1)
	if len(parts) == 0 {
		return nil, errors.New("Empty command")
	}
	args := make([]any, 0, len(parts)-1)
	strip := regexp.MustCompile(`^["']|["']$`)
	for _, p := range parts[1:] {
		args = append(args, strip.ReplaceAllString(p, ""))
	}
	start := time.Now()
	result, err := a.client.Do(ctx, append([]any{parts[0]}, args...)...).Result()
	if err != nil && err != goredis.Nil {
		return nil, err
	}
	return &CommandResult{Result: result, Command: trimmed, DurationMs: time.Since(start).Milliseconds()}, nil
}

func (a *Adapter) Close() error {
	return a.client.Close()
}

// TestRedisConnection mirrors testRedisConnection: ephemeral client, no
// retries, 3s dial timeout so a down Redis fails fast.
func TestRedisConnection(ctx context.Context, cfg Config) (*TestConnectionResult, error) {
	client := newClient(cfg, testConnectTimeout, true)
	defer client.Close()
	if err := client.Ping(ctx).Err(); err != nil {
		return &TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	return &TestConnectionResult{Success: true, ServerVersion: "Redis"}, nil
}
