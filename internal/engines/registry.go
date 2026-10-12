package engines

import (
	"context"
	"errors"
	"sync"
)

// ConnProfile is the flat connect contract factories consume — the adapter
// config objects the TS factory builds per kind, unified into one struct.
type ConnProfile struct {
	Kind     string
	Host     string
	Port     int64
	Database string
	Username string
	Password string
	// HasPassword mirrors the TS undefined-vs-empty distinction: an empty
	// stored password is still a saved password.
	HasPassword      bool
	SSL              bool
	FilePath         string
	ConnectionString string
}

// ErrConnectionNotFound lets callers distinguish missing profiles.
var ErrConnectionNotFound = errors.New("Connection not found")

// ProfileLoader resolves a connection id to its connect config (password
// included). store.Store implements it.
type ProfileLoader interface {
	ProfileForConnect(id string) (ConnProfile, error)
}

// FactoryFunc builds an adapter for one kind. Engine packages register via
// init() so engines itself never imports them.
type FactoryFunc func(cp ConnProfile) (SQLAdapter, error)

var (
	factoriesMu sync.RWMutex
	factories   = map[string]FactoryFunc{}
)

func RegisterFactory(kind string, f FactoryFunc) {
	factoriesMu.Lock()
	defer factoriesMu.Unlock()
	factories[kind] = f
}

// Registry caches one adapter per connection, mirroring the sidecar's
// module-level adapterCache in routes/sql.ts.
type Registry struct {
	loader ProfileLoader
	mu     sync.Mutex
	cache  map[string]SQLAdapter
}

func NewRegistry(loader ProfileLoader) *Registry {
	return &Registry{loader: loader, cache: map[string]SQLAdapter{}}
}

// Get mirrors getSqlAdapter: cached adapter wins; mongo/tigerbeetle keep
// their dedicated-route errors; missing password for password-required
// kinds fails early; unknown kinds cache an UnsupportedAdapter.
func (r *Registry) Get(ctx context.Context, connectionID string) (SQLAdapter, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if cached, ok := r.cache[connectionID]; ok {
		return cached, nil
	}
	cp, err := r.loader.ProfileForConnect(connectionID)
	if err != nil {
		return nil, err
	}
	switch cp.Kind {
	case KindMongoDB:
		return nil, errors.New("Use /mongo endpoint for MongoDB connections")
	case KindTigerBeetle:
		return nil, errors.New("TigerBeetle is not a SQL database")
	}
	if !cp.HasPassword && IsPasswordRequired(cp.Kind) {
		return nil, errors.New("Password not saved. Open connection settings and save with password.")
	}
	factoriesMu.RLock()
	factory := factories[cp.Kind]
	factoriesMu.RUnlock()
	var adapter SQLAdapter
	if factory == nil {
		adapter = &UnsupportedAdapter{Kind: cp.Kind}
	} else {
		adapter, err = factory(cp)
		if err != nil {
			return nil, err
		}
	}
	r.cache[connectionID] = adapter
	return adapter, nil
}

// Invalidate evicts and closes the cached adapter (profile updates).
func (r *Registry) Invalidate(connectionID string) {
	r.mu.Lock()
	adapter, ok := r.cache[connectionID]
	delete(r.cache, connectionID)
	r.mu.Unlock()
	if ok {
		_ = adapter.Close()
	}
}

// Close evicts and closes every cached adapter (app shutdown).
func (r *Registry) Close() {
	r.mu.Lock()
	cache := r.cache
	r.cache = map[string]SQLAdapter{}
	r.mu.Unlock()
	for _, adapter := range cache {
		_ = adapter.Close()
	}
}
