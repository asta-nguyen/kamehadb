// Package dbcore is the driver-free provider core: common contracts, an
// instance-local provider registry and the managed per-connection lifecycle.
// It imports no concrete database driver, provider package, or app package.
package dbcore

import (
	"context"
	"errors"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// Config is the flat connect contract factories consume; engines.ConnProfile
// stays the single Go source of truth for its fields.
type Config = engines.ConnProfile

// ConfigCheck is a nullable caller-supplied gate evaluated on the exact
// loaded entry config. A nil check admits every config. Checks perform no
// I/O and must not mutate the config.
type ConfigCheck func(Config) error

// Provider is the transport-independent common contract every engine
// provider satisfies. Family access goes through the typed helpers in
// capabilities.go.
type Provider interface {
	TestConnection(ctx context.Context) (*engines.TestConnectionResult, error)
	Close() error
}

// Factory builds one provider for one kind. Managed factories receive an
// entry-owned context; uncached Registry.Open passes the caller context.
type Factory func(ctx context.Context, cfg Config) (Provider, error)

var (
	// ErrProviderNotRegistered selects a kind no factory was registered for.
	ErrProviderNotRegistered = errors.New("provider not registered for kind")
	// ErrDuplicateProvider rejects a second registration for the same kind.
	ErrDuplicateProvider = errors.New("provider already registered for kind")
	// ErrNilFactory rejects a registration without a factory — Open would
	// otherwise dispatch nil and panic.
	ErrNilFactory = errors.New("provider factory is nil")
	// ErrCapabilityUnsupported is returned by the typed helpers when the
	// provider does not implement the requested capability family.
	ErrCapabilityUnsupported = errors.New("provider capability unsupported")
	// ErrManagerClosed rejects Manager.Get after Close.
	ErrManagerClosed = errors.New("provider manager closed")
	// ErrProviderRetired reports a wait on an entry that was retired
	// (invalidated or manager-closed) before the caller was served.
	ErrProviderRetired = errors.New("provider entry retired")
)

// sqlProvider adapts an engines.SQLAdapter to the common Provider contract.
type sqlProvider struct{ a engines.SQLAdapter }

// NewSQLProvider wraps a SQL adapter as a Provider.
func NewSQLProvider(a engines.SQLAdapter) Provider { return sqlProvider{a} }

func (p sqlProvider) TestConnection(ctx context.Context) (*engines.TestConnectionResult, error) {
	return p.a.TestConnection(ctx)
}
func (p sqlProvider) Close() error            { return p.a.Close() }
func (p sqlProvider) SQL() engines.SQLAdapter { return p.a }
