package api

import (
	"errors"
	"fmt"
	"os/exec"

	"github.com/asta-nguyen/kamehadb/internal/maintenance"
	"github.com/asta-nguyen/kamehadb/internal/store"
	"github.com/asta-nguyen/kamehadb/internal/terminal"
)

// TerminalService replaces the src-tauri postgres_psql + terminal_sessions
// commands. Sessions emit `terminal-session-event` payloads with the exact
// shape the frontend reducer expects.
type TerminalService struct {
	st   *store.Store
	term *terminal.Manager
	emit terminal.EmitFunc
}

func NewTerminalService(st *store.Store, term *terminal.Manager, emit terminal.EmitFunc) *TerminalService {
	return &TerminalService{st: st, term: term, emit: emit}
}

// TerminalSessionEvent is the Tauri event payload ported 1:1 — the frontend
// reducer discriminates on Type.
type TerminalSessionEvent struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	Kind      string `json:"kind"`
	Message   string `json:"message,omitempty"`
	Data      []int  `json:"data,omitempty"`
	ExitCode  int    `json:"exitCode,omitempty"`
}

// TerminalSize mirrors the frontend TerminalSize.
type TerminalSize struct {
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

func (s *TerminalService) emitEvent(ev TerminalSessionEvent) {
	if s.emit != nil {
		s.emit("terminal-session-event", ev)
	}
}

// StartPostgresPsqlSession spawns psql for a saved profile — the Go port of
// start_postgres_psql_session + build_psql_spec.
func (s *TerminalService) StartPostgresPsqlSession(connectionID string, cols, rows int) (map[string]string, error) {
	profile, err := maintenance.LoadPostgresProfile(s.st, connectionID)
	if err != nil {
		return nil, err
	}
	program := maintenance.ResolvePostgresProgram("psql")
	args := []string{
		"--host", profile.Host,
		"--port", fmt.Sprintf("%d", profile.Port),
		"--username", profile.Username,
		"--dbname", profile.Database,
		"--pset", "pager=off",
	}
	if profile.SSL {
		args = append(args, "--set", "sslmode=require")
	}

	var sessionID string
	sessionID, err = s.term.SpawnWithSink(program, args, uint16(cols), uint16(rows), profile.ConnectionEnv(),
		func(output []byte, exitCode int, exited bool) {
			if exited {
				message := "psql session ended"
				if exitCode != 0 {
					message = fmt.Sprintf("psql exited with code %d", exitCode)
				}
				s.emitEvent(TerminalSessionEvent{Type: "exit", SessionID: sessionID, Kind: "postgresPsql", ExitCode: exitCode, Message: message})
				return
			}
			data := make([]int, len(output))
			for i, b := range output {
				data[i] = int(b)
			}
			s.emitEvent(TerminalSessionEvent{Type: "data", SessionID: sessionID, Kind: "postgresPsql", Data: data})
		})
	if err != nil {
		var execErr *exec.Error
		if errors.As(err, &execErr) && errors.Is(execErr.Err, exec.ErrNotFound) {
			return nil, errors.New("psql was not found in PATH. Install the PostgreSQL client tools and try again")
		}
		return nil, err
	}
	s.emitEvent(TerminalSessionEvent{
		Type: "started", SessionID: sessionID, Kind: "postgresPsql",
		Message: "Connected to " + profile.Database,
	})
	return map[string]string{"sessionId": sessionID}, nil
}

// WriteTerminalSession — the write_terminal_session command.
func (s *TerminalService) WriteTerminalSession(sessionID, data string) error {
	return s.term.Write(sessionID, data)
}

// ResizeTerminalSession — the resize_terminal_session command.
func (s *TerminalService) ResizeTerminalSession(sessionID string, size TerminalSize) error {
	return s.term.Resize(sessionID, size.Cols, size.Rows)
}

// StopTerminalSession — the stop_terminal_session command.
func (s *TerminalService) StopTerminalSession(sessionID string) error {
	return s.term.Kill(sessionID)
}
