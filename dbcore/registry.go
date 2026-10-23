package dbcore

import (
	"context"
	"sync"
)

// Registry is an instance-local kind -> factory table. Registration is
// explicit and per instance; nothing registers globally.
type Registry struct {
	mu        sync.RWMutex
	factories map[string]Factory
}

func NewRegistry() *Registry {
	return &Registry{factories: map[string]Factory{}}
}

// Register adds a factory for kind; a second registration for the same kind
// is rejected.
func (r *Registry) Register(kind string, f Factory) error {
	if f == nil {
		return ErrNilFactory
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, dup := r.factories[kind]; dup {
		return ErrDuplicateProvider
	}
	r.factories[kind] = f
	return nil
}

// Open constructs an uncached provider for an explicit config, using the
// caller context. Unknown kinds return ErrProviderNotRegistered. A cancelled
// context never reaches the factory; if cancellation lands during
// construction, the produced provider is closed rather than leaked.
func (r *Registry) Open(ctx context.Context, kind string, cfg Config) (Provider, error) {
	r.mu.RLock()
	f, ok := r.factories[kind]
	r.mu.RUnlock()
	if !ok {
		return nil, ErrProviderNotRegistered
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	p, err := f(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		_ = p.Close()
		return nil, err
	}
	return p, nil
}

// factory resolves the registered factory for kind, or nil.
func (r *Registry) factory(kind string) Factory {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.factories[kind]
}

// Kinds returns the registered kind names.
func (r *Registry) Kinds() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	kinds := make([]string, 0, len(r.factories))
	for k := range r.factories {
		kinds = append(kinds, k)
	}
	return kinds
}
