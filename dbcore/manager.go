package dbcore

import (
	"context"
	"errors"
	"sync"
)

// ProfileLoader resolves a connection id to its connect config (password
// included). The app metadata store implements it.
type ProfileLoader interface {
	ProfileForConnect(id string) (Config, error)
}

// Manager owns one provider entry per connection id. Managed factories run
// on entry-owned contexts; each caller's context bounds only that caller's
// wait.
type Manager struct {
	loader     ProfileLoader
	reg        *Registry
	mu         sync.Mutex
	entries    map[string]*entry
	pending    map[*entry]chan struct{} // closes in flight; chan closes on finish
	retireErrs []retiredErr             // completed close failures from non-waited retires
	closed     bool
	closeDone  chan struct{} // closed once the first Close finishes
	closeErr   error
}

// retiredErr records a finished provider close failure so a later
// InvalidateAndWait* caller can still observe it after the entry left both
// m.entries and m.pending. Callers drain matching records, so each failure
// is surfaced once; anything left is reported by Manager.Close.
type retiredErr struct {
	id  string
	cfg Config
	err error
}

func NewManager(loader ProfileLoader, reg *Registry) *Manager {
	return &Manager{loader: loader, reg: reg, entries: map[string]*entry{}}
}

type entry struct {
	id       string
	ctx      context.Context
	cancel   context.CancelFunc
	mu       sync.Mutex
	loaded   chan struct{} // closed once cfg (or a load error) is published
	done     chan struct{} // closed once construction finished or the entry retired
	cfg      Config
	loadErr  error
	provider Provider
	err      error
	waiters  int
	started  bool
	retired  bool
	closeCh  chan struct{} // set with retired for started entries; closed once the provider close finishes
	closeErr error         // provider close result, written before closeCh closes
}

// ConfigGuard holds config-scoped protection through provider acquisition;
// callers release it after the lookup returns, including on errors.
type ConfigGuard func(Config) (release func(), err error)

// Get returns the managed provider for connectionID, running acceptConfig
// on the exact loaded entry config. A rejected caller gets its check error
// without invoking the factory and without disturbing other waiters.
func (m *Manager) Get(ctx context.Context, connectionID string, acceptConfig ConfigCheck) (Provider, error) {
	return m.get(ctx, connectionID, nil, acceptConfig, nil)
}

// GetFor behaves like Get but a NEW entry is created from the supplied
// config instead of loading the profile again. Callers that already
// resolved the config to pick a maintenance lock pass it here so the lock
// identity and the config reaching the factory can never diverge. An
// existing entry is reused only when it was built from the supplied config;
// stale entries are retired and rebuilt from this config.
func (m *Manager) GetFor(ctx context.Context, connectionID string, cfg Config, acceptConfig ConfigCheck) (Provider, error) {
	return m.get(ctx, connectionID, &cfg, acceptConfig, nil)
}

// GetWithGuard gets a managed provider while holding a guard selected from
// the exact cached or loaded config. The guard runs outside manager locks.
func (m *Manager) GetWithGuard(ctx context.Context, connectionID string, acceptConfig ConfigCheck, guard ConfigGuard) (Provider, error) {
	return m.get(ctx, connectionID, nil, acceptConfig, guard)
}

func (m *Manager) get(ctx context.Context, connectionID string, supplied *Config, acceptConfig ConfigCheck, guard ConfigGuard) (Provider, error) {
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return nil, ErrManagerClosed
	}
	e := m.entries[connectionID]
	if e == nil {
		c, cancel := context.WithCancel(context.Background())
		e = &entry{id: connectionID, ctx: c, cancel: cancel, loaded: make(chan struct{}), done: make(chan struct{})}
		m.entries[connectionID] = e
		if supplied != nil {
			e.cfg = *supplied
			close(e.loaded)
		} else {
			go e.load(m.loader)
		}
	}
	e.mu.Lock()
	e.waiters++
	e.mu.Unlock()
	m.mu.Unlock()

	// Wait for the entry's config; the caller context bounds only this wait.
	// (An entry retired before its factory starts closes done without
	// publishing; loaded still closes once the loader goroutine returns.)
	select {
	case <-ctx.Done():
		m.leave(e)
		return nil, ctx.Err()
	case <-e.loaded:
	case <-e.done:
		e.mu.Lock()
		retired := e.retired
		e.mu.Unlock()
		if retired {
			m.leave(e)
			return nil, ErrProviderRetired
		}
	}

	e.mu.Lock()
	if e.retired {
		e.mu.Unlock()
		m.leave(e)
		return nil, ErrProviderRetired
	}
	if e.loadErr != nil {
		e.mu.Unlock()
		m.leave(e)
		return nil, e.loadErr
	}
	if supplied != nil && e.cfg != *supplied {
		// The entry was built from an older profile read than the caller's —
		// retire it and rebuild under the caller's config so the lock they
		// hold always covers the file the provider actually opens. (A plain
		// Get supplies nothing and keeps the shared-entry semantics.)
		e.mu.Unlock()
		m.leave(e)
		_ = m.retire(e, false)
		return m.get(ctx, connectionID, supplied, acceptConfig, guard)
	}
	cfg := e.cfg
	e.mu.Unlock()
	if acceptConfig != nil {
		if err := acceptConfig(cfg); err != nil {
			m.leave(e)
			return nil, err
		}
	}
	var release func()
	if guard != nil {
		var err error
		release, err = guard(cfg)
		if err != nil {
			if release != nil {
				release()
			}
			m.leave(e)
			return nil, err
		}
	}
	if release != nil {
		defer release()
	}
	if err := ctx.Err(); err != nil {
		m.leave(e)
		return nil, err
	}

	var factory Factory
	start := false
	e.mu.Lock()
	if e.retired {
		e.mu.Unlock()
		m.leave(e)
		return nil, ErrProviderRetired
	}
	if !e.started {
		e.started = true
		factory = m.reg.factory(e.cfg.Kind)
		start = true
	}
	e.mu.Unlock()
	if start {
		go e.construct(factory)
	}

	select {
	case <-ctx.Done():
		m.leave(e)
		return nil, ctx.Err()
	case <-e.done:
		m.leave(e)
		e.mu.Lock()
		retired, p, err := e.retired, e.provider, e.err
		e.mu.Unlock()
		if retired {
			return nil, ErrProviderRetired
		}
		if err != nil {
			// Construction failures are not cached: retire so the next Get
			// builds a fresh entry.
			_ = m.retire(e, false)
			return nil, err
		}
		return p, nil
	}
}

// Invalidate retires the entry for connectionID, cancelling unfinished
// construction and closing a finished provider. For an in-flight entry the
// close happens asynchronously once construction reports done (the entry's
// context is already cancelled, so factories observe cancellation), because
// a profile update must not block on a slow constructor.
func (m *Manager) Invalidate(connectionID string) {
	m.mu.Lock()
	e := m.entries[connectionID]
	m.mu.Unlock()
	if e != nil {
		_ = m.retire(e, false)
	}
}

// Close permanently stops new Gets and retires every entry, reporting any
// teardown error — including providers whose construction only finished
// after Close began, and entries an Invalidate or last-waiter retire had
// already removed from the map (their close errors are stashed in
// m.retireErrs). A concurrent Close waits for the first to finish and
// reports the same result.
func (m *Manager) Close() error {
	m.mu.Lock()
	if m.closeDone != nil {
		done := m.closeDone
		m.mu.Unlock()
		<-done // closeErr is written before closeDone is closed
		return m.closeErr
	}
	m.closeDone = make(chan struct{})
	m.closed = true
	entries := make([]*entry, 0, len(m.entries))
	for _, e := range m.entries {
		entries = append(entries, e)
	}
	m.mu.Unlock()
	var errs []error
	addErr := func(err error) {
		if err == nil {
			return
		}
		// A racing non-waited retire's error can arrive both as a retire
		// return value and via m.retireErrs — keep one copy.
		for _, seen := range errs {
			if errors.Is(seen, err) {
				return
			}
		}
		errs = append(errs, err)
	}
	for _, e := range entries {
		addErr(m.retire(e, true))
	}
	// Retiring an entry registers its pending close under the same lock as the
	// retired mark, so a single snapshot drains every close already in flight.
	m.mu.Lock()
	pending := make([]chan struct{}, 0, len(m.pending))
	for _, ch := range m.pending {
		pending = append(pending, ch)
	}
	m.mu.Unlock()
	for _, ch := range pending {
		<-ch
	}
	m.mu.Lock()
	for _, re := range m.retireErrs {
		addErr(re.err)
	}
	m.closeErr = errors.Join(errs...)
	close(m.closeDone)
	m.mu.Unlock()
	return m.closeErr
}

// leave drops one waiter; holding m.mu through the last-waiter decision keeps
// new gets from joining an empty entry before its retirement is published.
func (m *Manager) leave(e *entry) {
	m.mu.Lock()
	e.mu.Lock()
	e.waiters--
	unfinished := false
	select {
	case <-e.done:
	default:
		unfinished = true
	}
	retire := e.waiters == 0 && unfinished && !e.retired
	var state retirement
	if retire {
		state, _ = m.markRetiredLocked(e)
	}
	e.mu.Unlock()
	m.mu.Unlock()
	if retire {
		_ = m.finishRetire(e, state, false)
	}
}

// InvalidateAndWait retires the connection's entry like Invalidate but
// blocks until its provider is fully closed — including when a racing
// non-waited retire already removed it from the map or has marked it
// retired but not yet registered its pending close. File maintenance uses
// it so no provider handle survives into the file operation.
func (m *Manager) InvalidateAndWait(connectionID string) error {
	m.mu.Lock()
	e := m.entries[connectionID]
	var pe *entry
	if e == nil {
		// The entry was already removed: its delete and pending registration
		// are one critical section, so an in-flight close is already visible.
		for cand := range m.pending {
			if cand.id == connectionID {
				pe = cand
				break
			}
		}
	}
	m.mu.Unlock()

	var err error
	switch {
	case e != nil:
		err = m.retire(e, true) // waits on a racing retire's close via closeCh
	case pe != nil:
		<-pe.closeCh // closeCh-close happens-after the closeErr write
		err = pe.closeErr
	}
	// Recorded failures for this id are drained last, so a close finishing
	// during our wait is caught too — and deduped against the error this
	// call already reports, keeping each failure to a single report.
	m.mu.Lock()
	kept := m.retireErrs[:0]
	for _, re := range m.retireErrs {
		if re.id == connectionID {
			if err == nil || !errors.Is(err, re.err) {
				err = errors.Join(err, re.err)
			}
		} else {
			kept = append(kept, re)
		}
	}
	m.retireErrs = kept
	m.mu.Unlock()
	return err
}

// InvalidateAndWaitWhere retires every managed entry whose loaded config
// satisfies match and waits for all of their closes — including matching
// entries a racing retire already removed from the map. File maintenance
// uses it so providers held by OTHER profiles pointing at the same file
// cannot keep a stale handle through the operation.
func (m *Manager) InvalidateAndWaitWhere(match func(Config) bool) error {
	m.mu.Lock()
	entries := make([]*entry, 0, len(m.entries))
	for _, e := range m.entries {
		entries = append(entries, e)
	}
	m.mu.Unlock()
	var errs []error
	for _, e := range entries {
		<-e.loaded // cfg is published before loaded closes
		e.mu.Lock()
		cfg, loadErr := e.cfg, e.loadErr
		e.mu.Unlock()
		if loadErr != nil || !match(cfg) {
			continue
		}
		if err := m.retire(e, true); err != nil {
			errs = append(errs, err)
		}
	}
	// Entries already removed by racing retires live only in m.pending.
	m.mu.Lock()
	var pending []*entry
	for pe := range m.pending {
		pending = append(pending, pe)
	}
	m.mu.Unlock()
	for _, pe := range pending {
		pe.mu.Lock()
		cfg, loadErr := pe.cfg, pe.loadErr
		pe.mu.Unlock()
		if loadErr != nil || !match(cfg) {
			continue
		}
		<-pe.closeCh
		if pe.closeErr != nil {
			errs = append(errs, pe.closeErr)
		}
	}
	// Completed close failures matching this file are drained AFTER the
	// waits — including records a finishing close appended while we waited —
	// and deduped against errors this call already collected, so a failure
	// is reported once rather than repeated to the next maintenance run.
	m.mu.Lock()
	kept := m.retireErrs[:0]
	for _, re := range m.retireErrs {
		if !match(re.cfg) {
			kept = append(kept, re)
			continue
		}
		seen := false
		for _, e := range errs {
			if errors.Is(e, re.err) {
				seen = true
				break
			}
		}
		if !seen {
			errs = append(errs, re.err)
		}
	}
	m.retireErrs = kept
	m.mu.Unlock()
	return errors.Join(errs...)
}

type retirement struct {
	started bool
	closeCh chan struct{}
}

// markRetiredLocked publishes retirement and pending-close tracking together
// so admission and shutdown cannot observe a half-retired entry.
func (m *Manager) markRetiredLocked(e *entry) (retirement, bool) {
	state := retirement{started: e.started, closeCh: e.closeCh}
	if e.retired {
		return state, false
	}
	e.retired = true
	state.started = e.started
	if state.started {
		state.closeCh = make(chan struct{})
		e.closeCh = state.closeCh
		if m.pending == nil {
			m.pending = map[*entry]chan struct{}{}
		}
		m.pending[e] = state.closeCh
	} else {
		select {
		case <-e.done:
		default:
			close(e.done)
		}
	}
	if m.entries[e.id] == e {
		delete(m.entries, e.id)
	}
	return state, true
}

// retire marks an entry while holding the same locks used for admission. An
// unstarted entry never reaches its factory; a started close is tracked until
// its result is published, with non-waited failures retained for maintenance.
func (m *Manager) retire(e *entry, wait bool) error {
	m.mu.Lock()
	e.mu.Lock()
	state, marked := m.markRetiredLocked(e)
	e.mu.Unlock()
	m.mu.Unlock()
	if !marked {
		if wait && state.closeCh != nil {
			<-state.closeCh // a racing retire owns the close; report its result
			return e.closeErr
		}
		return nil
	}
	return m.finishRetire(e, state, wait)
}

// finishRetire runs outside manager/entry locks so provider close callbacks
// cannot block lookup admission or shutdown bookkeeping.
func (m *Manager) finishRetire(e *entry, state retirement, wait bool) error {
	e.cancel()
	if !state.started {
		return nil
	}
	// finish publishes the close result atomically with the pending removal:
	// waited retires return the error; non-waited retires record it so a
	// later InvalidateAndWait* caller (or Manager.Close) still observes the
	// failure after the entry itself is gone.
	finish := func(err error) error {
		e.closeErr = err // must land before closeCh closes for waiters to see it
		m.mu.Lock()
		close(state.closeCh)
		delete(m.pending, e)
		if !wait && err != nil {
			m.retireErrs = append(m.retireErrs, retiredErr{id: e.id, cfg: e.cfg, err: err})
		}
		m.mu.Unlock()
		return err
	}
	if wait {
		<-e.done
		return finish(closeProvider(e))
	}
	select {
	case <-e.done:
		return finish(closeProvider(e))
	default:
		go func() {
			<-e.done
			_ = finish(closeProvider(e))
		}()
		return nil
	}
}

func closeProvider(e *entry) error {
	if e.provider != nil {
		return e.provider.Close()
	}
	return nil
}

func (e *entry) load(loader ProfileLoader) {
	cfg, err := loader.ProfileForConnect(e.id)
	e.mu.Lock()
	e.cfg, e.loadErr = cfg, err
	e.mu.Unlock()
	close(e.loaded)
}

func (e *entry) construct(f Factory) {
	var p Provider
	var err error
	switch {
	case f == nil:
		err = ErrProviderNotRegistered
	case e.ctx.Err() != nil:
		// The entry was retired between dispatch and execution; a cancelled
		// entry context must never reach the factory (construction would
		// produce a provider nobody owns beyond the async retire close).
		err = e.ctx.Err()
	default:
		p, err = f(e.ctx, e.cfg)
	}
	e.mu.Lock()
	e.provider, e.err = p, err
	e.mu.Unlock()
	close(e.done)
}
