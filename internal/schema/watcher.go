package schema

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/logs"

	"github.com/jackc/pgx/v5"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/postgres"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// Constants from sidecar lib/constants.ts.
const (
	WatcherDefaultIntervalMs int64 = 60 * 60 * 1000
	WatcherMinIntervalMs     int64 = 5 * 60 * 1000
	WatcherMaxSnapshots            = 50
	watcherReconnectInitial        = 5 * time.Second
	watcherReconnectMax            = 60 * time.Second
	notifyChannel                  = "kamehadb_schema_change"
)

// CaptureFunc captures one snapshot — injected by the API layer so this
// package has no dependency on the engine registry (same injection pattern
// as the TS schemaWatcher.setCaptureFn).
type CaptureFunc func(connectionID string, source SnapshotSource) error

type notifyEntry struct {
	cancel  context.CancelFunc
	stopped bool
}

// WatcherManager ports SchemaWatcherManager.
type WatcherManager struct {
	st      *store.Store
	capture CaptureFunc

	mu                sync.Mutex
	cadenceStop       map[string]chan struct{}
	cadenceInFlight   map[string]bool
	lastCaptureAt     map[string]string
	notifyListeners   map[string]*notifyEntry
	reconnectTimers   map[string]*time.Timer
	reconnectAttempts map[string]int
}

func NewWatcherManager(st *store.Store) *WatcherManager {
	return &WatcherManager{
		st:                st,
		cadenceStop:       map[string]chan struct{}{},
		cadenceInFlight:   map[string]bool{},
		lastCaptureAt:     map[string]string{},
		notifyListeners:   map[string]*notifyEntry{},
		reconnectTimers:   map[string]*time.Timer{},
		reconnectAttempts: map[string]int{},
	}
}

func (w *WatcherManager) SetCaptureFunc(fn CaptureFunc) { w.capture = fn }

// StartCadence ports startCadence: persist config, tick on interval, guard
// against overlapping captures.
func (w *WatcherManager) StartCadence(connectionID string, intervalMs int64) {
	w.StopCadence(connectionID)

	existing, _ := w.st.GetSchemaWatcher(connectionID)
	notify := false
	if existing != nil {
		notify = existing.NotifyEnabled
	}
	_ = w.st.UpsertSchemaWatcher(store.SchemaWatcherConfig{
		ConnectionID: connectionID, CadenceEnabled: true,
		NotifyEnabled: notify, IntervalMs: intervalMs,
	})

	stop := make(chan struct{})
	w.mu.Lock()
	w.cadenceStop[connectionID] = stop
	w.mu.Unlock()

	go func() {
		ticker := time.NewTicker(time.Duration(intervalMs) * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				w.mu.Lock()
				if w.cadenceInFlight[connectionID] {
					w.mu.Unlock()
					continue
				}
				w.cadenceInFlight[connectionID] = true
				w.mu.Unlock()
				if err := w.runCapture(connectionID, SourceAutoCadence); err != nil {
					logs.Error("schema-watcher", fmt.Sprintf("cadence capture failed for %s: %v", connectionID, err))
				}
				w.mu.Lock()
				w.cadenceInFlight[connectionID] = false
				w.mu.Unlock()
			}
		}
	}()
	logs.Debug("schema-watcher", fmt.Sprintf("cadence watcher started for %s (%dms)", connectionID, intervalMs))
}

// StopCadence ports stopCadence — clears the timer, persists disabled.
func (w *WatcherManager) StopCadence(connectionID string) {
	w.mu.Lock()
	if stop, ok := w.cadenceStop[connectionID]; ok {
		close(stop)
		delete(w.cadenceStop, connectionID)
	}
	delete(w.cadenceInFlight, connectionID)
	w.mu.Unlock()

	if existing, _ := w.st.GetSchemaWatcher(connectionID); existing != nil {
		_ = w.st.UpsertSchemaWatcher(store.SchemaWatcherConfig{
			ConnectionID: connectionID, CadenceEnabled: false,
			NotifyEnabled: existing.NotifyEnabled, IntervalMs: existing.IntervalMs,
		})
	}
}

// StartNotify ports startNotify — postgres-only LISTEN loop on a dedicated
// connection; only persists notifyEnabled after connect+LISTEN succeed.
func (w *WatcherManager) StartNotify(connectionID string) error {
	w.StopNotify(connectionID)

	cp, err := w.st.ProfileForConnect(connectionID)
	if err != nil || cp.Kind != engines.KindPostgres {
		return errNotifyPGOnly{}
	}
	existing, _ := w.st.GetSchemaWatcher(connectionID)

	if err := w.connectNotify(connectionID, cp); err != nil {
		return err
	}
	cfg := store.SchemaWatcherConfig{
		ConnectionID: connectionID, NotifyEnabled: true,
		IntervalMs: WatcherDefaultIntervalMs,
	}
	if existing != nil {
		cfg.CadenceEnabled = existing.CadenceEnabled
		cfg.IntervalMs = existing.IntervalMs
	}
	_ = w.st.UpsertSchemaWatcher(cfg)
	logs.Debug("schema-watcher", fmt.Sprintf("pg_notify watcher started for %s", connectionID))
	return nil
}

type errNotifyPGOnly struct{}

func (errNotifyPGOnly) Error() string {
	return "pg_notify watcher is only available for PostgreSQL connections"
}

func (w *WatcherManager) connectNotify(connectionID string, cp engines.ConnProfile) error {
	conn, err := postgres.NewNotifyConn(context.Background(), cp)
	if err != nil {
		return err
	}
	if _, err := conn.Exec(context.Background(), "LISTEN "+notifyChannel); err != nil {
		conn.Close(context.Background())
		return err
	}
	ctx, cancel := context.WithCancel(context.Background())
	entry := &notifyEntry{cancel: cancel}
	w.mu.Lock()
	w.notifyListeners[connectionID] = entry
	w.mu.Unlock()

	go w.notifyLoop(connectionID, conn, ctx, entry)
	return nil
}

// notifyLoop mirrors client.on('notification'|'error'|'end'): each
// notification triggers an auto-notify capture; a connection error or close
// (unless stopped) schedules a linear-backoff reconnect.
func (w *WatcherManager) notifyLoop(connectionID string, conn *pgx.Conn, ctx context.Context, entry *notifyEntry) {
	for {
		_, err := conn.WaitForNotification(ctx)
		if err != nil {
			conn.Close(context.Background())
			w.mu.Lock()
			stopped := entry.stopped
			w.mu.Unlock()
			if stopped {
				return
			}
			logs.Warn("schema-watcher", fmt.Sprintf("pg_notify listener error for %s — scheduling reconnect: %v", connectionID, err))
			w.scheduleReconnect(connectionID)
			return
		}
		if err := w.runCapture(connectionID, SourceAutoNotify); err != nil {
			logs.Error("schema-watcher", fmt.Sprintf("pg_notify auto-snapshot failed for %s: %v", connectionID, err))
		}
	}
}

func (w *WatcherManager) runCapture(connectionID string, source SnapshotSource) error {
	if w.capture == nil {
		logs.Warn("schema-watcher", fmt.Sprintf("capture function not set — skipping capture for %s", connectionID))
		return nil
	}
	if err := w.capture(connectionID, source); err != nil {
		return err
	}
	w.mu.Lock()
	w.lastCaptureAt[connectionID] = time.Now().UTC().Format(time.RFC3339Nano)
	w.mu.Unlock()
	return nil
}

// Status ports getStatus.
func (w *WatcherManager) Status(connectionID string) WatcherStatus {
	cfg, _ := w.st.GetSchemaWatcher(connectionID)
	interval := WatcherDefaultIntervalMs
	if cfg != nil {
		interval = cfg.IntervalMs
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	return WatcherStatus{
		CadenceRunning: w.cadenceStop[connectionID] != nil,
		NotifyRunning:  w.notifyListeners[connectionID] != nil,
		IntervalMs:     interval,
		LastCaptureAt:  w.lastCaptureAt[connectionID],
	}
}

// ResumeAll ports resumeAll — restarts enabled watchers on app startup.
func (w *WatcherManager) ResumeAll() {
	enabled, err := w.st.ListEnabledSchemaWatchers()
	if err != nil {
		return
	}
	for _, cfg := range enabled {
		if cfg.CadenceEnabled {
			w.StartCadence(cfg.ConnectionID, cfg.IntervalMs)
		}
		if cfg.NotifyEnabled {
			if err := w.StartNotify(cfg.ConnectionID); err != nil {
				logs.Error("schema-watcher", fmt.Sprintf("failed to resume pg_notify watcher for %s: %v", cfg.ConnectionID, err))
			}
		}
	}
}

// StopAll ports stopAll — called on shutdown.
func (w *WatcherManager) StopAll() {
	w.mu.Lock()
	for id, stop := range w.cadenceStop {
		close(stop)
		delete(w.cadenceStop, id)
	}
	for id, e := range w.notifyListeners {
		e.stopped = true
		e.cancel()
		delete(w.notifyListeners, id)
	}
	for id, t := range w.reconnectTimers {
		t.Stop()
		delete(w.reconnectTimers, id)
	}
	w.reconnectAttempts = map[string]int{}
	w.mu.Unlock()
}

// StopNotify ports stopNotify — cancels the listener, persists disabled.
func (w *WatcherManager) StopNotify(connectionID string) {
	w.mu.Lock()
	if t, ok := w.reconnectTimers[connectionID]; ok {
		t.Stop()
		delete(w.reconnectTimers, connectionID)
	}
	delete(w.reconnectAttempts, connectionID)
	if e, ok := w.notifyListeners[connectionID]; ok {
		e.stopped = true
		e.cancel()
		delete(w.notifyListeners, connectionID)
	}
	w.mu.Unlock()

	if existing, _ := w.st.GetSchemaWatcher(connectionID); existing != nil {
		_ = w.st.UpsertSchemaWatcher(store.SchemaWatcherConfig{
			ConnectionID: connectionID, CadenceEnabled: existing.CadenceEnabled,
			NotifyEnabled: false, IntervalMs: existing.IntervalMs,
		})
	}
}

func (w *WatcherManager) scheduleReconnect(connectionID string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if t, ok := w.reconnectTimers[connectionID]; ok {
		t.Stop()
	}
	attempt := w.reconnectAttempts[connectionID] + 1
	w.reconnectAttempts[connectionID] = attempt
	delay := watcherReconnectInitial * time.Duration(attempt)
	if delay > watcherReconnectMax {
		delay = watcherReconnectMax
	}
	w.reconnectTimers[connectionID] = time.AfterFunc(delay, func() {
		w.mu.Lock()
		delete(w.reconnectTimers, connectionID)
		w.mu.Unlock()
		if err := w.reconnectNotify(connectionID); err != nil {
			logs.Warn("schema-watcher", fmt.Sprintf("pg_notify reconnect failed for %s: %v", connectionID, err))
			w.scheduleReconnect(connectionID)
		}
	})
}

func (w *WatcherManager) reconnectNotify(connectionID string) error {
	cp, err := w.st.ProfileForConnect(connectionID)
	if err != nil {
		logs.Info("schema-watcher", fmt.Sprintf("connection profile gone for %s — stopping notify listener", connectionID))
		w.StopNotify(connectionID)
		return err
	}
	w.mu.Lock()
	if old, ok := w.notifyListeners[connectionID]; ok {
		old.stopped = true
		old.cancel()
		delete(w.notifyListeners, connectionID)
	}
	w.mu.Unlock()
	if err := w.connectNotify(connectionID, cp); err != nil {
		return err
	}
	w.mu.Lock()
	delete(w.reconnectAttempts, connectionID)
	w.mu.Unlock()
	logs.Debug("schema-watcher", fmt.Sprintf("pg_notify listener reconnected for %s", connectionID))
	return nil
}
