// Package database wires the app profile store to the shared provider core:
// one registry assembled with all ten providers, one manager owning every
// GUI provider session, and the family checks the old service-local maps
// enforced at construction time.
package database

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"sync"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	dbmongo "github.com/asta-nguyen/kamehadb/dbcore/mongo"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/all"
	dbredis "github.com/asta-nguyen/kamehadb/dbcore/redis"
	appengines "github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/logs"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// DB is the single GUI lookup/teardown owner. It implements
// engines.SQLLookup for SqlService/SchemaService/AiService.
type DB struct {
	Registry *dbcore.Registry
	Manager  *dbcore.Manager
	Loader   dbcore.ProfileLoader

	maintMu   sync.Mutex
	maint     map[string]*sync.RWMutex // file-maintenance locks keyed by file path (or connection id for non-file kinds)
	maintRefs map[string]int           // holders and waiters keep each keyed lock alive
}

// New assembles the provider registry and manager over the app store.
func New(loader dbcore.ProfileLoader) (*DB, error) {
	reg, err := all.New(all.Options{
		DuckDBRuntimeDir: store.DataDir,
		DuckDBLog:        func(msg string) { logs.Info("duckdb", msg) },
	})
	if err != nil {
		return nil, err
	}
	// Keep retained Qdrant profiles on the old unsupported SQL fallback without
	// adding this legacy kind to the public provider-core inventory.
	if err := reg.Register(appengines.KindQdrant, func(_ context.Context, _ dbcore.Config) (dbcore.Provider, error) {
		return dbcore.NewSQLProvider(&engines.UnsupportedAdapter{Kind: appengines.KindQdrant}), nil
	}); err != nil {
		return nil, err
	}
	return &DB{Registry: reg, Manager: dbcore.NewManager(loader, reg), Loader: loader, maint: map[string]*sync.RWMutex{}}, nil
}

// Get satisfies engines.SQLLookup: the SQL family check runs on the loaded
// or stored config inside the manager, preserving the old registry's exact
// wrong-kind and credential messages.
func (d *DB) Get(ctx context.Context, connectionID string) (engines.SQLAdapter, error) {
	p, err := d.get(ctx, connectionID, sqlCheck)
	if err != nil {
		return nil, err
	}
	return dbcore.SQL(p)
}

// Mongo returns the MongoDB operations capability for the connection,
// rejecting non-MongoDB profiles with the old service message.
func (d *DB) Mongo(ctx context.Context, connectionID string) (dbmongo.Operations, error) {
	p, err := d.get(ctx, connectionID, func(c dbcore.Config) error {
		if c.Kind != engines.KindMongoDB {
			return fmt.Errorf("Connection %s is not a mongodb connection", connectionID)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return dbcore.Mongo(p)
}

// Redis returns the Redis operations capability for the connection,
// rejecting non-Redis profiles with the old service message.
func (d *DB) Redis(ctx context.Context, connectionID string) (dbredis.Operations, error) {
	p, err := d.get(ctx, connectionID, func(c dbcore.Config) error {
		if c.Kind != engines.KindRedis {
			return fmt.Errorf("This endpoint is for redis connections only")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return dbcore.Redis(p)
}

// get lets the manager reuse its cached config on hits and acquires the
// matching file read lock only after it resolves that config.
func (d *DB) get(ctx context.Context, connectionID string, check dbcore.ConfigCheck) (dbcore.Provider, error) {
	return d.Manager.GetWithGuard(ctx, connectionID, check, func(cfg dbcore.Config) (func(), error) {
		return d.acquireMaintenanceLock(maintenanceKey(connectionID, cfg), false), nil
	})
}

// WithMaintenance serializes file maintenance with managed provider opens
// for the connection's FILE: taking the write side first queues new lookups
// and waits for in-flight ones, then every managed provider whose profile
// points at the same file is fully closed before fn runs — if any close
// fails the file op is skipped rather than run against a handle that may
// still be open. Matching providers are invalidated again after fn so no
// stale file handle survives either outcome. The optional after hook runs
// while the write lock is still held — caller cleanup (same-file cache
// invalidation) must complete before any queued lookup can reopen a
// provider on the replaced file. Both hooks receive the same resolved config
// used to select the lock, keeping the operation on the protected file.
func (d *DB) WithMaintenance(connectionID string, fn func(dbcore.Config) error, after func(dbcore.Config)) error {
	cfg, err := d.Loader.ProfileForConnect(connectionID)
	if err != nil {
		return err
	}
	release := d.acquireMaintenanceLock(maintenanceKey(connectionID, cfg), true)
	defer release()
	retire := func() error {
		if fk, ok := fileKey(cfg); ok {
			return d.Manager.InvalidateAndWaitWhere(func(c dbcore.Config) bool {
				cc, ok := fileKey(c)
				return ok && cc == fk
			})
		}
		return d.Manager.InvalidateAndWait(connectionID)
	}
	if err := retire(); err != nil {
		return fmt.Errorf("closing providers before file maintenance: %w", err)
	}
	err = fn(cfg)
	joined := errors.Join(err, retire())
	if after != nil {
		after(cfg)
	}
	return joined
}

// maintenanceKey derives the lock identity: file-database profiles share a
// key per canonical file path so cross-profile opens serialize together;
// other profiles keep a per-connection key (maintenance never touches them,
// the read lock is a no-op for coordination).
func maintenanceKey(connectionID string, cfg dbcore.Config) string {
	if fk, ok := fileKey(cfg); ok {
		return "file:" + fk
	}
	return "conn:" + connectionID
}

// fileKey reports the canonical file path for file-database configs.
func fileKey(cfg dbcore.Config) (string, bool) {
	return CanonicalFilePath(cfg.Kind, cfg.FilePath)
}

// CanonicalFilePath reports the canonical path a file-database profile
// points at — the same identity the maintenance locks and
// InvalidateAndWaitWhere matching use — so other packages (connection
// invalidation) can find sibling profiles on the same file.
func CanonicalFilePath(kind, path string) (string, bool) {
	if path == "" || !engines.IsFileDatabaseKind(kind) {
		return "", false
	}
	if abs, err := filepath.Abs(path); err == nil {
		return abs, true
	}
	return filepath.Clean(path), true
}

// acquireMaintenanceLock retains a keyed lock before waiting, then prunes it
// after its final holder or queued caller releases it.
func (d *DB) acquireMaintenanceLock(key string, write bool) func() {
	d.maintMu.Lock()
	if d.maint == nil {
		d.maint = map[string]*sync.RWMutex{}
	}
	if d.maintRefs == nil {
		d.maintRefs = map[string]int{}
	}
	l := d.maint[key]
	if l == nil {
		l = &sync.RWMutex{}
		d.maint[key] = l
	}
	d.maintRefs[key]++
	d.maintMu.Unlock()
	if write {
		l.Lock()
	} else {
		l.RLock()
	}
	return func() {
		if write {
			l.Unlock()
		} else {
			l.RUnlock()
		}
		d.maintMu.Lock()
		d.maintRefs[key]--
		if d.maintRefs[key] == 0 {
			delete(d.maintRefs, key)
			if d.maint[key] == l {
				delete(d.maint, key)
			}
		}
		d.maintMu.Unlock()
	}
}

// Open is the typed uncached probe path (connection dialog input). The SQL
// family check applies to explicit config the same way it applies to a
// loaded entry. File-database probes share the file's maintenance read lock
// so a test connection cannot open a file mid-restore.
func (d *DB) Open(ctx context.Context, cfg dbcore.Config) (dbcore.Provider, error) {
	if fk, ok := fileKey(cfg); ok {
		release := d.acquireMaintenanceLock("file:"+fk, false)
		defer release()
	}
	if engines.IsSQLKind(cfg.Kind) {
		if err := sqlCheck(cfg); err != nil {
			return nil, err
		}
	}
	return d.Registry.Open(ctx, cfg.Kind, cfg)
}

// Invalidate retires the connection's provider entry once for all families.
func (d *DB) Invalidate(connectionID string) { d.Manager.Invalidate(connectionID) }

// Close stops all lookups and tears down every managed provider.
func (d *DB) Close() error { return d.Manager.Close() }

// sqlCheck is the app's SQL family ConfigCheck: dedicated-route kinds are
// rejected before factory dispatch (dedicated adapters would otherwise be
// constructed only for dbcore.SQL to fail), preserving the old registry's
// exact wrong-kind and credential messages. Unregistered/legacy kinds fall
// through to selection.
func sqlCheck(c dbcore.Config) error {
	switch c.Kind {
	case engines.KindMongoDB:
		return errors.New("Use /mongo endpoint for MongoDB connections")
	case engines.KindRedis:
		return errors.New("Use /redis endpoint for Redis connections")
	case appengines.KindTigerBeetle:
		return errors.New("TigerBeetle is not a SQL database")
	}
	if !c.HasPassword && engines.IsPasswordRequired(c.Kind) {
		return errors.New("Password not saved. Open connection settings and save with password.")
	}
	return nil
}
