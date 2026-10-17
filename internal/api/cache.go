package api

import (
	"container/list"
	"strings"
	"sync"
	"time"
)

// Port of apps/sidecar/src/lib/cache.ts — LRU entries with per-key TTL
// checked on read. Max entries mirrors CACHE_MAX_ENTRIES.
const (
	cacheMaxEntries   = 100
	schemaCacheTime   = 5 * 60 * 1000 * time.Millisecond // SCHEMA_CACHE_TIME
	statsCacheTime    = 30 * 1000 * time.Millisecond     // STATS_CACHE_TIME
	aiSchemaCacheTime = 5 * 60 * 1000 * time.Millisecond // AI_SCHEMA_CACHE_TIME
)

type cacheEntry struct {
	key       string
	data      any
	timestamp time.Time
}

type ttlCache struct {
	mu    sync.Mutex
	items map[string]*list.Element
	lru   *list.List
}

func newTTLCache() *ttlCache {
	return &ttlCache{items: map[string]*list.Element{}, lru: list.New()}
}

func (c *ttlCache) get(key string, ttl time.Duration) any {
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.items[key]
	if !ok {
		return nil
	}
	entry := el.Value.(*cacheEntry)
	if time.Since(entry.timestamp) >= ttl {
		return nil
	}
	c.lru.MoveToFront(el)
	return entry.data
}

func (c *ttlCache) set(key string, data any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		el.Value.(*cacheEntry).data = data
		el.Value.(*cacheEntry).timestamp = time.Now()
		c.lru.MoveToFront(el)
		return
	}
	el := c.lru.PushFront(&cacheEntry{key: key, data: data, timestamp: time.Now()})
	c.items[key] = el
	for c.lru.Len() > cacheMaxEntries {
		back := c.lru.Back()
		delete(c.items, back.Value.(*cacheEntry).key)
		c.lru.Remove(back)
	}
}

// clearConnection mirrors clearConnectionCache — keys carry the id as
// `:{id}:` or a `:{id}` suffix so conn-1 never matches conn-12.
func (c *ttlCache) clearConnection(connectionID string) {
	infix := ":" + connectionID + ":"
	suffix := ":" + connectionID
	c.mu.Lock()
	defer c.mu.Unlock()
	for key, el := range c.items {
		if strings.Contains(key, infix) || strings.HasSuffix(key, suffix) {
			delete(c.items, key)
			c.lru.Remove(el)
		}
	}
}

// delete removes one exact key — the mongoDatabase branch of
// clearSchemaCache in the TS original.
func (c *ttlCache) delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		delete(c.items, key)
		c.lru.Remove(el)
	}
}

func (c *ttlCache) clearSchema(connectionID string) {
	prefix := "ai-schema:" + connectionID + ":"
	exact := "ai-schema:" + connectionID
	c.mu.Lock()
	defer c.mu.Unlock()
	for key, el := range c.items {
		if strings.HasPrefix(key, prefix) || key == exact {
			delete(c.items, key)
			c.lru.Remove(el)
		}
	}
}
