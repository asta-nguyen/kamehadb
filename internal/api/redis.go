package api

import (
	"context"
	"fmt"

	"github.com/asta-nguyen/kamehadb/dbcore/redis"
	"github.com/asta-nguyen/kamehadb/internal/database"
)

// RedisService ports routes/redis.ts: key scan/value/ttl, raw commands,
// INFO stats (TTL-cached), and the test dispatch.
type RedisService struct {
	db       *database.DB
	cache    *ttlCache
	requests *requestJobs
}

func NewRedisService(db *database.DB, cache *ttlCache) *RedisService {
	return &RedisService{db: db, cache: cache, requests: newRequestJobs()}
}

// adapterFor mirrors getNonSqlAdapter(REDIS): the shared manager owns the
// provider; wrong-kind profiles are rejected by its ConfigCheck.
func (s *RedisService) adapterFor(connectionID string) (redis.Operations, error) {
	return s.adapterForContext(context.Background(), connectionID)
}

// Cancellation during lookup bounds only this caller's wait; a cancelled
// caller never receives a stale-profile provider.
func (s *RedisService) adapterForContext(ctx context.Context, connectionID string) (redis.Operations, error) {
	return s.db.Redis(ctx, connectionID)
}

// Invalidate drops the cached client on profile change.
func (s *RedisService) Invalidate(connectionID string) {
	s.db.Invalidate(connectionID)
	s.cache.clearConnection(connectionID)
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
	input.Scope = connectionID
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

// GetRedisKeyPage — POST /redis/:id/keys/page. Paged value inspector.
func (s *RedisService) GetRedisKeyPage(connectionID string, input redis.RedisValuePageInput) (*redis.RedisValuePage, error) {
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
	input.Scope = connectionID
	return owned.GetKeyPage(job.ctx, input)
}

// ReleaseRedisCursor drops the remainder session referenced by a lease
// cursor. Releasing an unknown or completed continuation is a no-op.
func (s *RedisService) ReleaseRedisCursor(connectionID, cursor string) (map[string]bool, error) {
	ops, err := s.adapterForContext(context.Background(), connectionID)
	if err != nil {
		return map[string]bool{"released": false}, nil
	}
	req, cleanup := ops.ForRequest(context.Background())
	defer cleanup()
	return map[string]bool{"released": req.ReleaseCursor(cursor)}, nil
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
