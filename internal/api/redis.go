package api

import (
	"context"
	"fmt"
	"strconv"
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
}

func NewRedisService(st *store.Store, cache *ttlCache) *RedisService {
	return &RedisService{st: st, adapters: map[string]*redis.Adapter{}, cache: cache}
}

// adapterFor mirrors getNonSqlAdapter(REDIS) — profile.database parses to
// the logical DB index like createRedisDbAdapter.
func (s *RedisService) adapterFor(connectionID string) (*redis.Adapter, error) {
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
	password, _ := s.st.GetProfilePassword(connectionID)
	cfg := redis.Config{
		Host:     strOf(p.Host),
		Port:     int64Of(p.Port),
		Password: password,
	}
	if db := strOf(p.Database); db != "" {
		if n, err := strconv.Atoi(db); err == nil && n >= 0 {
			cfg.Database = n
		}
	}
	a := redis.New(cfg)
	s.mu.Lock()
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
	a, err := s.adapterFor(connectionID)
	if err != nil {
		return nil, err
	}
	return a.ScanKeys(context.Background(), input)
}

// GetRedisKey — POST /redis/:id/keys/value.
func (s *RedisService) GetRedisKey(connectionID, key string) (*redis.RedisValue, error) {
	a, err := s.adapterFor(connectionID)
	if err != nil {
		return nil, err
	}
	return a.GetKey(context.Background(), key)
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
	a, err := s.adapterFor(connectionID)
	if err != nil {
		return nil, err
	}
	return a.RunCommand(context.Background(), command)
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
