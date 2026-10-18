// Package terminal is the shared PTY session manager — one implementation
// for every embedded shell (mongosh now, psql later), replacing the
// node-pty + SSE session map in the sidecar's mongo.ts.
//
// Output flows two ways: before a consumer attaches it buffers (like the
// sidecar's session.buffer), after Attach it streams to the frontend via
// Wails events on the session-scoped channel.
package terminal

import (
	"crypto/rand"
	"errors"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/creack/pty"
)

// newID produces a 21-char URL-safe session id (nanoid-equivalent).
func newID() string {
	const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-"
	buf := make([]byte, 21)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	for i, b := range buf {
		buf[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(buf)
}

// SessionTimeout mirrors SHELL_TIMEOUT_MS — sessions older than this are
// killed by the cleanup sweep.
const (
	SessionTimeout = 30 * time.Minute
	sweepInterval  = time.Minute
)

// EmitFunc delivers an event payload to the frontend — bound to
// wailsRuntime.EventsEmit by the caller.
type EmitFunc func(event string, data any)

// EventName returns the Wails event channel for a session's output.
func EventName(sessionID string) string { return "terminal:" + sessionID }

type eventPayload struct {
	Type string `json:"type"`
	Data string `json:"data,omitempty"`
	Code int    `json:"code,omitempty"`
}

var ErrSessionNotFound = errors.New("Shell session not found")

type session struct {
	cmd       *exec.Cmd
	ptmx      *os.File
	createdAt time.Time
	mu        sync.Mutex
	buffer    []byte
	streaming bool
	done      chan struct{}
	exitCode  int
	exited    bool
	sink      SessionSink
}

// Manager owns live PTY sessions and the expiry sweep.
type Manager struct {
	emit EmitFunc

	mu        sync.Mutex
	sessions  map[string]*session
	stopSweep chan struct{}
}

func NewManager(emit EmitFunc) *Manager {
	m := &Manager{
		emit:      emit,
		sessions:  map[string]*session{},
		stopSweep: make(chan struct{}),
	}
	go m.sweep()
	return m
}

// SessionSink receives raw output chunks and process exit — a consumer that
// wants its own event shape (the psql terminal-session-event stream) instead
// of the default `terminal:<id>` channel.
type SessionSink func(output []byte, exitCode int, exited bool)

// Spawn starts program in a PTY and begins capturing output immediately —
// before any consumer attaches (matches the sidecar's buffer-until-SSE).
func (m *Manager) Spawn(program string, args []string, cols, rows uint16, env []string) (string, error) {
	return m.SpawnWithSink(program, args, cols, rows, env, nil)
}

// SpawnWithSink is Spawn with a custom output sink replacing the
// `terminal:<id>` events.
func (m *Manager) SpawnWithSink(program string, args []string, cols, rows uint16, env []string, sink SessionSink) (string, error) {
	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}
	cmd := exec.Command(program, args...)
	// Env is additive like Rust's CommandBuilder: inherited environment plus
	// overrides, with the TERM hints the psql tab relied on.
	cmd.Env = append(os.Environ(), "COLORTERM=truecolor", "TERM=xterm-256color")
	cmd.Env = append(cmd.Env, env...)
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: cols, Rows: rows})
	if err != nil {
		return "", err
	}
	s := &session{cmd: cmd, ptmx: ptmx, createdAt: time.Now(), done: make(chan struct{}), sink: sink}
	id := newID()
	m.mu.Lock()
	m.sessions[id] = s
	m.mu.Unlock()

	go m.pump(id, s)
	go m.reap(id, s)
	return id, nil
}

// pump copies PTY output into the buffer or the event stream.
func (m *Manager) pump(id string, s *session) {
	buf := make([]byte, 4096)
	for {
		n, err := s.ptmx.Read(buf)
		if n > 0 {
			chunk := append([]byte(nil), buf[:n]...)
			if s.sink != nil {
				s.sink(chunk, 0, false)
				continue
			}
			s.mu.Lock()
			streaming := s.streaming
			if !streaming {
				s.buffer = append(s.buffer, chunk...)
			}
			s.mu.Unlock()
			if streaming {
				m.emit(EventName(id), eventPayload{Type: "output", Data: string(chunk)})
			}
		}
		if err != nil {
			return
		}
	}
}

// reap waits for process exit, emits the exit event, and removes the
// session after a grace period so a racing Attach still resolves.
func (m *Manager) reap(id string, s *session) {
	err := s.cmd.Wait()
	s.mu.Lock()
	s.exited = true
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			s.exitCode = exitErr.ExitCode()
		} else {
			s.exitCode = -1
		}
	}
	s.mu.Unlock()
	if s.sink != nil {
		s.sink(nil, s.exitCode, true)
	} else {
		m.emit(EventName(id), eventPayload{Type: "exit", Code: s.exitCode})
	}
	close(s.done)

	// Give a racing Attach a moment to observe the exit before removal.
	time.AfterFunc(30*time.Second, func() {
		m.mu.Lock()
		delete(m.sessions, id)
		m.mu.Unlock()
	})
}

// Attach returns buffered output and switches the session to streaming.
func (m *Manager) Attach(id string) (string, error) {
	m.mu.Lock()
	s, ok := m.sessions[id]
	m.mu.Unlock()
	if !ok {
		return "", ErrSessionNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.streaming = true
	out := string(s.buffer)
	s.buffer = nil
	return out, nil
}

func (m *Manager) get(id string) (*session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[id]
	if !ok {
		return nil, ErrSessionNotFound
	}
	return s, nil
}

// Alive reports whether the session exists and the process still runs —
// the frontend polls this like the old 204/404 write probe.
func (m *Manager) Alive(id string) bool {
	s, err := m.get(id)
	if err != nil {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return !s.exited
}

// Write sends keystrokes to stdin.
func (m *Manager) Write(id, data string) error {
	s, err := m.get(id)
	if err != nil {
		return err
	}
	_, err = s.ptmx.WriteString(data)
	return err
}

// Resize changes the PTY window size.
func (m *Manager) Resize(id string, cols, rows uint16) error {
	s, err := m.get(id)
	if err != nil {
		return err
	}
	return pty.Setsize(s.ptmx, &pty.Winsize{Cols: cols, Rows: rows})
}

// Kill terminates the process and removes the session.
func (m *Manager) Kill(id string) error {
	m.mu.Lock()
	s, ok := m.sessions[id]
	if ok {
		delete(m.sessions, id)
	}
	m.mu.Unlock()
	if !ok {
		return ErrSessionNotFound
	}
	s.ptmx.Close()
	if s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}
	return nil
}

// sweep prunes expired sessions every minute — the sidecar's SHELL_CLEANUP.
func (m *Manager) sweep() {
	ticker := time.NewTicker(sweepInterval)
	defer ticker.Stop()
	for {
		select {
		case <-m.stopSweep:
			return
		case now := <-ticker.C:
			m.mu.Lock()
			var expired []string
			for id, s := range m.sessions {
				if now.Sub(s.createdAt) > SessionTimeout {
					expired = append(expired, id)
				}
			}
			for _, id := range expired {
				s := m.sessions[id]
				delete(m.sessions, id)
				s.ptmx.Close()
				if s.cmd.Process != nil {
					_ = s.cmd.Process.Kill()
				}
			}
			m.mu.Unlock()
		}
	}
}

// Shutdown kills every session and stops the sweep — killAllMongoShells.
func (m *Manager) Shutdown() {
	close(m.stopSweep)
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, s := range m.sessions {
		delete(m.sessions, id)
		s.ptmx.Close()
		if s.cmd.Process != nil {
			_ = s.cmd.Process.Kill()
		}
	}
}
