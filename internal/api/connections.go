// Package api holds the Wails-bound services replacing the sidecar's Hono
// route groups. Bound methods keep the same observable behavior; errors are
// the messages the frontend already displays.
package api

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	mysqlprovider "github.com/asta-nguyen/kamehadb/dbcore/providers/mysql"
	postgresprovider "github.com/asta-nguyen/kamehadb/dbcore/providers/postgres"
	"github.com/asta-nguyen/kamehadb/internal/database"
	appengines "github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/maintenance"
	"github.com/asta-nguyen/kamehadb/internal/mcp"
	"github.com/asta-nguyen/kamehadb/internal/schema"
	"github.com/asta-nguyen/kamehadb/internal/store"
	"github.com/asta-nguyen/kamehadb/internal/terminal"
)

const (
	// CONNECTION_TEST_TIMEOUT_MS / CONNECTION_HEALTH_INTERVAL_MS from the
	// sidecar constants.
	connTestTimeout    = 5 * time.Second
	connHealthInterval = 60 * time.Second

	// HealthEvent carries the id→result map the SSE stream used to push.
	HealthEvent = "connections:health"
)

var errConnectionNotFound = errors.New("Connection not found")

// HealthResult is the per-connection probe payload.
type HealthResult struct {
	Success   bool     `json:"success"`
	Message   string   `json:"message,omitempty"`
	LatencyMs *float64 `json:"latencyMs,omitempty"`
}

// ConnectionsService replaces routes/connections.ts.
type ConnectionsService struct {
	store *store.Store
	db    *database.DB
	ctx   context.Context

	// onCacheClear mirrors clearConnectionCache — wired to SqlService's
	// cache in main.go.
	onCacheClear func(connectionID string)

	inflightMu sync.Mutex
	inflight   map[string]*healthCall
}

func NewConnectionsService(s *store.Store, db *database.DB) *ConnectionsService {
	return &ConnectionsService{store: s, db: db, inflight: map[string]*healthCall{}}
}

// Services is the full set of Wails-bound services plus lifecycle pieces.
type Services struct {
	Connections *ConnectionsService
	SQL         *SqlService
	Schemas     *SchemaService
	Mongo       *MongoService
	Redis       *RedisService
	History     *QueryHistoryService
	AI          *AiService
	Terminal    *TerminalService
	Maintenance *MaintenanceService
	Logs        *LogsService
	MCP         *McpService
	Health      *HealthLoop
	Watcher     *schema.WatcherManager
}

// Export lifetime uses the existing unbound service container, not another
// Wails-bound app or native-dialog implementation.
func (sv *Services) StartExports(ctx context.Context) { sv.SQL.startExports(ctx) }
func (sv *Services) CloseExports()                    { sv.SQL.closeExports() }

// GUI request ownership is shared across services and ends before adapters.
func (sv *Services) StartRequests(ctx context.Context) { sv.SQL.requests.start(ctx) }
func (sv *Services) CloseRequests()                    { sv.SQL.requests.close() }

// Bound returns the service list for wails Run's Bind option.
func (sv *Services) Bound() []interface{} {
	return []interface{}{
		sv.Connections, sv.SQL, sv.Schemas, sv.Mongo, sv.Redis,
		sv.History, sv.AI, sv.Terminal, sv.Maintenance, sv.Logs, sv.MCP,
	}
}

// NewServices wires the bound services: caches clear when connections
// mutate, the health loop drives the ConnectionsService, the schema watcher
// gets its capture function through the registry, and the terminal manager
// is shared by every embedded-shell service.
func NewServices(s *store.Store, db *database.DB, emit terminal.EmitFunc, mcpRuntime *mcp.Runtime) *Services {
	sv := &Services{}
	sv.Connections = NewConnectionsService(s, db)
	cache := newTTLCache() // one shared cache, like the sidecar's module-level map
	sv.SQL = NewSqlService(db, cache, s.ProfileReadOnly)
	term := terminal.NewManager(emit)
	sv.Mongo = NewMongoService(s, db, term, cache)
	sv.Redis = NewRedisService(db, cache)
	sv.Mongo.requests = sv.SQL.requests
	sv.Redis.requests = sv.SQL.requests
	sv.History = NewQueryHistoryService(s)
	sv.AI = NewAiService(s, db, sv.Mongo, sv.SQL, cache, emit)
	sv.Terminal = NewTerminalService(s, term, emit)
	sv.Maintenance = NewMaintenanceService(s, emit)
	sv.Logs = NewLogsService()
	sv.MCP = NewMcpService(s, mcpRuntime)
	sv.Connections.onCacheClear = func(connectionID string) {
		sv.SQL.requests.cancelConnection(connectionID)
		sv.SQL.clearConnectionCache(connectionID)
		if mcpRuntime != nil {
			mcpRuntime.Manager.Invalidate(connectionID)
		}
	}
	sv.Watcher = schema.NewWatcherManager(s)
	sv.Schemas = NewSchemaService(s, db, sv.Watcher)
	sv.Health = NewHealthLoop(sv.Connections)
	return sv
}

func (s *ConnectionsService) ListConnections() ([]store.Profile, error) {
	return s.store.ListProfiles()
}

func (s *ConnectionsService) GetConnection(id string) (*store.Profile, error) {
	p, err := s.store.GetProfile(id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, errConnectionNotFound
	}
	return p, nil
}

// validateCreate mirrors CreateConnectionProfileSchema's refinement.
func validateCreate(in store.ProfileInput) error {
	kind := strOf(in.Kind)
	if in.Name == nil || strings.TrimSpace(*in.Name) == "" {
		return errors.New("name is required")
	}
	if !appengines.IsValidKind(kind) {
		return fmt.Errorf("Invalid database kind: %s", kind)
	}
	if kind == engines.KindMongoDB && strOf(in.ConnectionString) == "" {
		return errors.New("Connection string is required for MongoDB connections")
	}
	if (kind == engines.KindSQLite || kind == engines.KindDuckDB) && strOf(in.FilePath) == "" {
		return errors.New("Database file path is required for SQLite/DuckDB connections")
	}
	if engines.IsUsernameRequired(kind) && strings.TrimSpace(strOf(in.Username)) == "" {
		return fmt.Errorf("Username is required for %s connections", kind)
	}
	if engines.IsPasswordRequired(kind) && in.Password == nil {
		return fmt.Errorf("Password is required for %s connections", kind)
	}
	return nil
}

func (s *ConnectionsService) CreateConnection(in store.ProfileInput) (*store.Profile, error) {
	if err := validateCreate(in); err != nil {
		return nil, err
	}
	return s.store.CreateProfile(in)
}

func ptrEq[T comparable](a, b *T) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func (s *ConnectionsService) UpdateConnection(id string, in store.ProfileInput) (*store.Profile, error) {
	existing, err := s.store.GetProfileLenient(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, errConnectionNotFound
	}
	if in.Name != nil && strings.TrimSpace(*in.Name) == "" {
		return nil, errors.New("name is required")
	}
	if in.Kind != nil && !appengines.IsValidKind(*in.Kind) {
		return nil, fmt.Errorf("Invalid database kind: %s", *in.Kind)
	}
	account, err := s.store.GetMCPManagedAccount(id)
	if err != nil {
		return nil, err
	}
	if account != nil {
		oldPassword, err := s.store.GetProfilePassword(id)
		if err != nil {
			return nil, err
		}
		protected := (in.Kind != nil && *in.Kind != existing.Kind) ||
			(in.Host != nil && !ptrEq(in.Host, existing.Host)) ||
			(in.Port != nil && !ptrEq(in.Port, existing.Port)) ||
			(in.Database != nil && !ptrEq(in.Database, existing.Database)) ||
			(in.Username != nil && !ptrEq(in.Username, existing.Username)) ||
			(in.Password != nil && *in.Password != oldPassword) ||
			(in.SSL != nil && *in.SSL != existing.SSL) ||
			(in.FilePath != nil && !ptrEq(in.FilePath, existing.FilePath)) ||
			(in.ConnectionString != nil && !ptrEq(in.ConnectionString, existing.ConnectionString))
		if protected {
			return nil, errors.New("Revoke the managed MCP account before changing database connection details or credentials")
		}
	}
	profile, err := s.store.UpdateProfile(id, in)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return nil, errConnectionNotFound
	}
	s.invalidateConnection(id)
	return profile, nil
}

func (s *ConnectionsService) DeleteConnection(id string) error {
	account, err := s.store.GetMCPManagedAccount(id)
	if err != nil {
		return err
	}
	if account != nil {
		return errors.New("Revoke the managed MCP account before deleting this connection")
	}
	deleted, err := s.store.DeleteProfile(id)
	if err != nil {
		return err
	}
	if !deleted {
		return errConnectionNotFound
	}
	s.invalidateConnection(id)
	return nil
}

// invalidateConnection mirrors clearConnectionCache + invalidateAdapterCache
// + invalidateMcpConnection + activeHealthChecks eviction.
func (s *ConnectionsService) invalidateConnection(id string) {
	// Cancel owned work before any adapter is closed for the changed profile.
	if s.onCacheClear != nil {
		s.onCacheClear(id)
	}
	s.db.Invalidate(id)
	s.inflightMu.Lock()
	delete(s.inflight, id)
	s.inflightMu.Unlock()
	// MCP adapter-manager invalidation is wired by Task 25.
}

// BackupFileDatabase mirrors POST /connections/:id/backup — the file op runs
// inside WithMaintenance so managed provider opens for the connection are
// serialized and the entry is invalidated on every outcome.
func (s *ConnectionsService) BackupFileDatabase(id, outputPath string) (*maintenance.MaintenanceResult, error) {
	profile, err := s.store.GetProfile(id)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return nil, errConnectionNotFound
	}
	var res *maintenance.MaintenanceResult
	err = s.db.WithMaintenance(id, func(cfg dbcore.Config) error {
		var err error
		res, err = maintenance.BackupFileDatabase(cfg.Kind, cfg.FilePath, outputPath)
		return err
	}, nil)
	if err != nil {
		return nil, err
	}
	return res, nil
}

// RestoreFileDatabase mirrors POST /connections/:id/restore.
func (s *ConnectionsService) RestoreFileDatabase(id, inputPath string) (*maintenance.MaintenanceResult, error) {
	profile, err := s.store.GetProfile(id)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return nil, errConnectionNotFound
	}
	var res *maintenance.MaintenanceResult
	// The file may have changed on disk even on error — the after hook drops
	// the Go-side TTL caches (ListDatabases/Schemas/Tables) and health state
	// for EVERY profile pointing at this file while the write lock still
	// holds, so a queued same-file lookup cannot open a provider mid-clear.
	err = s.db.WithMaintenance(id, func(cfg dbcore.Config) error {
		var err error
		res, err = maintenance.RestoreFileDatabase(cfg.Kind, cfg.FilePath, inputPath)
		return err
	}, func(cfg dbcore.Config) { s.invalidateFileProfiles(id, cfg) })
	if err != nil {
		return nil, err
	}
	return res, nil
}

// invalidateFileProfiles runs invalidateConnection for the profile and for
// every other stored profile resolving to the same canonical file — the
// maintenance lock already retired their providers, but TTL caches keyed
// by connection id still hold metadata from the replaced file.
func (s *ConnectionsService) invalidateFileProfiles(connectionID string, target dbcore.Config) {
	s.invalidateConnection(connectionID)
	key, ok := database.CanonicalFilePath(target.Kind, target.FilePath)
	if !ok {
		return
	}
	profiles, err := s.store.ListProfiles()
	if err != nil {
		return // best-effort; the target's own invalidation already ran
	}
	for _, p := range profiles {
		if p.ID == connectionID {
			continue
		}
		k, ok := database.CanonicalFilePath(p.Kind, strOf(p.FilePath))
		if ok && k == key {
			s.invalidateConnection(p.ID)
		}
	}
}

// TestConnection probes unvalidated input (the /test endpoint): per-kind
// required-field checks, then the same by-kind dispatch.
func (s *ConnectionsService) TestConnection(in store.ProfileInput) (*engines.TestConnectionResult, error) {
	kind := strOf(in.Kind)
	if engines.IsPasswordRequired(kind) && in.Password == nil {
		return &engines.TestConnectionResult{
			Success: false,
			Message: fmt.Sprintf("Password is required for %s connections", kind),
		}, nil
	}
	if engines.IsUsernameRequired(kind) && strOf(in.Username) == "" {
		return &engines.TestConnectionResult{
			Success: false,
			Message: fmt.Sprintf("Username is required for %s connections", kind),
		}, nil
	}
	res, err := s.testConnectionByKind("", connProfileFromInput(in))
	if err != nil {
		return &engines.TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	return res, nil
}

// CheckConnectionHealth is the single-shot probe behind the refresh button.
func (s *ConnectionsService) CheckConnectionHealth(id string) (*engines.TestConnectionResult, error) {
	profile, err := s.store.GetProfile(id)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return nil, errConnectionNotFound
	}
	cp, err := s.store.ProfileForConnect(id)
	if err != nil {
		return nil, err
	}
	res, err := s.testConnectionByKind(id, cp)
	if err != nil {
		return &engines.TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	return res, nil
}

// testConnectionByKind mirrors the sidecar's centralized dispatch: stored
// SQL profiles reuse their pooled provider; other kinds run a fresh
// uncached probe through the registry (dialog input has no connectionID).
func (s *ConnectionsService) testConnectionByKind(connectionID string, cp engines.ConnProfile) (*engines.TestConnectionResult, error) {
	if connectionID != "" && engines.IsSQLKind(cp.Kind) {
		adapter, err := s.db.Get(s.ctxOrBG(), connectionID)
		if err != nil {
			return nil, err
		}
		return adapter.TestConnection(s.ctxOrBG())
	}
	if connectionID == "" {
		switch cp.Kind {
		case engines.KindPostgres:
			return postgresprovider.TestPostgresConnection(s.ctxOrBG(), cp)
		case engines.KindMySQL:
			return mysqlprovider.TestMysqlConnection(s.ctxOrBG(), cp)
		}
	}
	if !engines.IsSQLKind(cp.Kind) && cp.Kind != engines.KindMongoDB && cp.Kind != engines.KindRedis {
		return &engines.TestConnectionResult{
			Success: false,
			Message: fmt.Sprintf("Unsupported database kind: %s", cp.Kind),
		}, nil
	}
	p, err := s.db.Open(s.ctxOrBG(), cp)
	if err != nil {
		if engines.IsSQLKind(cp.Kind) {
			return nil, err
		}
		return &engines.TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	defer func() { _ = p.Close() }()
	return p.TestConnection(s.ctxOrBG())
}

func (s *ConnectionsService) ctxOrBG() context.Context {
	if s.ctx != nil {
		return s.ctx
	}
	return context.Background()
}

// healthCall is the singleflight entry bounding drivers without native
// cancellation to one in-flight probe per connection (TS activeHealthChecks).
type healthCall struct {
	done   chan struct{}
	result *engines.TestConnectionResult
}

func (s *ConnectionsService) activeHealthCheck(id string, cp engines.ConnProfile) *engines.TestConnectionResult {
	s.inflightMu.Lock()
	if c, ok := s.inflight[id]; ok {
		s.inflightMu.Unlock()
		<-c.done
		return c.result
	}
	c := &healthCall{done: make(chan struct{})}
	s.inflight[id] = c
	s.inflightMu.Unlock()

	var res *engines.TestConnectionResult
	var err error
	if cp.Kind == engines.KindDuckDB {
		// Background rounds must not download/start an unused helper or open
		// another process against a database already locked by its active child.
		ctx, cancel := context.WithTimeout(s.ctxOrBG(), connTestTimeout)
		defer cancel()
		var adapter engines.SQLAdapter
		adapter, err = s.db.Get(ctx, id)
		if err == nil {
			if probe, ok := adapter.(interface {
				BackgroundHealth(context.Context) (*engines.TestConnectionResult, error)
			}); ok {
				res, err = probe.BackgroundHealth(ctx)
			} else {
				res = &engines.TestConnectionResult{Success: false, Message: "Open DuckDB to initialize its optional driver"}
			}
		}
	} else {
		res, err = s.testConnectionByKind(id, cp)
	}
	if err != nil {
		res = &engines.TestConnectionResult{Success: false, Message: err.Error()}
	}
	c.result = res
	close(c.done)

	s.inflightMu.Lock()
	if s.inflight[id] == c {
		delete(s.inflight, id)
	}
	s.inflightMu.Unlock()
	return res
}

// CheckAllHealth runs one probe round over every saved profile and returns
// the same map the SSE stream pushed. The health loop emits it on HealthEvent.
func (s *ConnectionsService) CheckAllHealth() (map[string]HealthResult, error) {
	profiles, err := s.store.ListProfiles()
	if err != nil {
		return nil, err
	}
	results := make(map[string]HealthResult, len(profiles))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, p := range profiles {
		p := p
		wg.Add(1)
		go func() {
			defer wg.Done()
			cp, err := s.store.ProfileForConnect(p.ID)
			var res *engines.TestConnectionResult
			start := time.Now()
			if err != nil {
				res = &engines.TestConnectionResult{Success: false, Message: err.Error()}
			} else {
				res = s.timedCheck(p.ID, cp)
			}
			latency := float64(time.Since(start).Microseconds()) / 1000
			mu.Lock()
			results[p.ID] = HealthResult{
				Success:   res.Success,
				Message:   res.Message,
				LatencyMs: &latency,
			}
			mu.Unlock()
		}()
	}
	wg.Wait()
	return results, nil
}

// timedCheck mirrors withTimeout: caller gets a timeout result while the
// underlying probe stays in the inflight map for the next round.
func (s *ConnectionsService) timedCheck(id string, cp engines.ConnProfile) *engines.TestConnectionResult {
	resCh := make(chan *engines.TestConnectionResult, 1)
	go func() { resCh <- s.activeHealthCheck(id, cp) }()
	select {
	case r := <-resCh:
		return r
	case <-time.After(connTestTimeout):
		return &engines.TestConnectionResult{
			Success: false,
			Message: fmt.Sprintf("Timeout after %dms", connTestTimeout.Milliseconds()),
		}
	}
}

// HealthLoop emits HealthEvent every CONNECTION_HEALTH_INTERVAL_MS — the
// SSE /connections/health stream's replacement. Kept off the bound service
// so lifecycle methods don't leak into generated bindings.
type HealthLoop struct {
	svc  *ConnectionsService
	stop chan struct{}
}

func NewHealthLoop(svc *ConnectionsService) *HealthLoop {
	return &HealthLoop{svc: svc}
}

func (h *HealthLoop) Start(ctx context.Context) {
	h.svc.ctx = ctx
	if h.stop != nil {
		return
	}
	h.stop = make(chan struct{})
	go func() {
		emit := func() {
			if results, err := h.svc.CheckAllHealth(); err == nil {
				wailsRuntime.EventsEmit(ctx, HealthEvent, results)
			}
		}
		emit() // the SSE stream yielded a round on connect too
		ticker := time.NewTicker(connHealthInterval)
		defer ticker.Stop()
		for {
			select {
			case <-h.stop:
				return
			case <-ctx.Done():
				return
			case <-ticker.C:
				emit()
			}
		}
	}()
}

func (h *HealthLoop) Stop() {
	if h.stop != nil {
		close(h.stop)
		h.stop = nil
	}
}

// SetConnectionMCPEnabled mirrors PATCH /:id/mcp with its enable guards.
type MCPEnableResult struct {
	ID         string `json:"id"`
	MCPEnabled bool   `json:"mcpEnabled"`
}

func (s *ConnectionsService) SetConnectionMCPEnabled(id string, enabled bool) (*MCPEnableResult, error) {
	existing, err := s.store.GetProfile(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, errConnectionNotFound
	}
	if enabled && !appengines.IsMCPSupportedKind(existing.Kind) {
		return nil, errors.New("This database kind is not supported for MCP")
	}
	if enabled && appengines.IsMCPServerKind(existing.Kind) {
		account, err := s.store.GetMCPManagedAccount(id)
		if err != nil {
			return nil, err
		}
		if account == nil || account.State != store.MCPStateReady {
			return nil, errors.New("Create a managed read-only account before enabling MCP")
		}
		hasCred, err := s.store.HasMCPManagedCredential(id)
		if err != nil {
			return nil, err
		}
		if !hasCred {
			return nil, errors.New("The managed credential is not available from local storage")
		}
	}
	updated, err := s.store.SetProfileMCPEnabled(id, enabled)
	if err != nil {
		return nil, err
	}
	if updated == nil {
		return nil, errConnectionNotFound
	}
	s.invalidateConnection(id)
	return &MCPEnableResult{ID: updated.ID, MCPEnabled: updated.MCPEnabled}, nil
}

func connProfileFromInput(in store.ProfileInput) engines.ConnProfile {
	cp := engines.ConnProfile{Kind: strOf(in.Kind)}
	if in.Host != nil {
		cp.Host = *in.Host
	}
	if in.Port != nil {
		cp.Port = *in.Port
	}
	if in.Database != nil {
		cp.Database = *in.Database
	}
	if in.Username != nil {
		cp.Username = *in.Username
	}
	if in.Password != nil {
		cp.Password = *in.Password
		cp.HasPassword = true
	}
	if in.SSL != nil {
		cp.SSL = *in.SSL
	}
	if in.SSLCACert != nil {
		cp.SSLCACert = *in.SSLCACert
	}
	if in.FilePath != nil {
		cp.FilePath = *in.FilePath
	}
	if in.ConnectionString != nil {
		cp.ConnectionString = *in.ConnectionString
	}
	return cp
}

func strOf(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
