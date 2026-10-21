package api

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"sync"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/redis"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// RedisService ports routes/redis.ts: key scan/value/ttl, raw commands,
// INFO stats (TTL-cached), and the test dispatch.
type RedisService struct {
	st *store.Store

	mu       sync.Mutex
	adapters map[string]*redis.Adapter
	cache    *ttlCache
	requests *requestJobs
}

func NewRedisService(st *store.Store, cache *ttlCache) *RedisService {
	return &RedisService{st: st, adapters: map[string]*redis.Adapter{}, cache: cache, requests: newRequestJobs()}
}

// adapterFor mirrors getNonSqlAdapter(REDIS) — profile.database parses to
// the logical DB index like createRedisDbAdapter.
func (s *RedisService) adapterFor(connectionID string) (*redis.Adapter, error) {
	return s.adapterForContext(context.Background(), connectionID)
}

// Do not publish a newly constructed old-profile client after cancellation.
// Only the winning cache owner keeps its prototype; other clients are closed.
func (s *RedisService) adapterForContext(ctx context.Context, connectionID string) (*redis.Adapter, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.Lock()
	if a, ok := s.adapters[connectionID]; ok {
		s.mu.Unlock()
		return a, nil
	}
	s.mu.Unlock()

	p, err := s.st.GetProfile(connectionID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, errConnectionNotFound
	}
	if p.Kind != engines.KindRedis {
		return nil, fmt.Errorf("This endpoint is for redis connections only")
	}
	password, err := s.st.GetProfilePassword(connectionID)
	if err != nil {
		return nil, err
	}
	cfg := redis.Config{
		Host:     strOf(p.Host),
		Port:     int64Of(p.Port),
		Password: password,
	}
	if db := strings.Trim(strOf(p.Database), "/"); db != "" {
		if n, err := strconv.Atoi(db); err == nil && n >= 0 {
			cfg.Database = n
		}
	}
	a := redis.New(cfg)
	s.mu.Lock()
	if err := ctx.Err(); err != nil {
		s.mu.Unlock()
		_ = a.Close()
		return nil, err
	}
	if cached := s.adapters[connectionID]; cached != nil {
		s.mu.Unlock()
		_ = a.Close()
		return cached, nil
	}
	s.adapters[connectionID] = a
	s.mu.Unlock()
	return a, nil
}

// Invalidate drops the cached client on profile change.
func (s *RedisService) Invalidate(connectionID string) {
	s.mu.Lock()
	if a, ok := s.adapters[connectionID]; ok {
		delete(s.adapters, connectionID)
		a.Close()
	}
	s.mu.Unlock()
	s.cache.clearConnection(connectionID)
}

// Shutdown closes every cached client.
func (s *RedisService) Shutdown() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, a := range s.adapters {
		a.Close()
		delete(s.adapters, id)
	}
}

// ScanRedisKeys — POST /redis/:id/keys.
func (s *RedisService) ScanRedisKeys(connectionID string, input redis.ScanKeysInput) (*redis.KeyPage, error) {
	job, err := s.requests.begin(connectionID, input.RequestID)
	if err != nil {
		return nil, err
	}
	defer s.requests.finish(job)
	a, err := s.adapterForContext(job.ctx, connectionID)
	if err != nil {
		return nil, err
	}
	if err := job.ctx.Err(); err != nil {
		return nil, err
	}
	owned, close := a.ForRequest(job.ctx)
	defer close()
	return owned.ScanKeys(job.ctx, input)
}

// GetRedisKey — POST /redis/:id/keys/value.
func (s *RedisService) GetRedisKey(connectionID, key string) (*redis.RedisValue, error) {
	return s.GetRedisKeyWithRequest(connectionID, redis.RedisKeyRequest{Key: key})
}

// The controlled companion keeps old scalar calls compatible and registers
// the request before any adapter lookup or value read.
func (s *RedisService) GetRedisKeyWithRequest(connectionID string, input redis.RedisKeyRequest) (*redis.RedisValue, error) {
	job, err := s.requests.begin(connectionID, input.RequestID)
	if err != nil {
		return nil, err
	}
	defer s.requests.finish(job)
	a, err := s.adapterForContext(job.ctx, connectionID)
	if err != nil {
		return nil, err
	}
	if err := job.ctx.Err(); err != nil {
		return nil, err
	}
	owned, close := a.ForRequest(job.ctx)
	defer close()
	return owned.GetKey(job.ctx, input.Key)
}

// GetRedisTTL — POST /redis/:id/keys/ttl (returns {ttl} like the route).
func (s *RedisService) GetRedisTTL(connectionID, key string) (map[string]int64, error) {
	a, err := s.adapterFor(connectionID)
	if err != nil {
		return nil, err
	}
	ttl, err := a.GetTTL(context.Background(), key)
	if err != nil {
		return nil, err
	}
	return map[string]int64{"ttl": ttl}, nil
}

// RunRedisCommand — POST /redis/:id/commands.
func (s *RedisService) RunRedisCommand(connectionID, command string) (*redis.CommandResult, error) {
	return s.RunRedisCommandWithRequest(connectionID, redis.RedisCommandRequest{Command: command})
}

// A request-owned Redis pool makes blocking commands genuinely interruptible
// without closing another tab's socket; ambiguous writes are never replayed.
func (s *RedisService) RunRedisCommandWithRequest(connectionID string, input redis.RedisCommandRequest) (*redis.CommandResult, error) {
	job, err := s.requests.begin(connectionID, input.RequestID)
	if err != nil {
		return nil, err
	}
	defer s.requests.finish(job)
	a, err := s.adapterForContext(job.ctx, connectionID)
	if err != nil {
		return nil, err
	}
	if err := job.ctx.Err(); err != nil {
		return nil, err
	}
	owned, close := a.ForRequest(job.ctx)
	defer close()
	result, err := owned.RunCommand(job.ctx, input.Command)
	if job.ctx.Err() != nil {
		return nil, fmt.Errorf("Redis command cancelled; it may already have executed; do not replay automatically: %w", job.ctx.Err())
	}
	return result, err
}

// GetRedisStats — GET /redis/:id/stats (STATS TTL cache).
func (s *RedisService) GetRedisStats(connectionID string) (*redis.RedisStats, error) {
	key := fmt.Sprintf("redis:%s:stats", connectionID)
	if cached := s.cache.get(key, statsCacheTime); cached != nil {
		return cached.(*redis.RedisStats), nil
	}
	a, err := s.adapterFor(connectionID)
	if err != nil {
		return nil, err
	}
	stats, err := a.GetStats(context.Background())
	if err != nil {
		return nil, err
	}
	s.cache.set(key, stats)
	return stats, nil
}
