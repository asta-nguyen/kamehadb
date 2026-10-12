package maintenance

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// JobManager runs pg_dump/pg_restore/pg_restore/psql restore jobs and reports
// progress on the `postgres-tool-event` channel — the Go port of
// postgres_tools/jobs.rs.
type JobManager struct {
	emit func(event string, data any)

	mu   sync.Mutex
	jobs map[string]*job
}

type job struct {
	cmd       *exec.Cmd
	cancelled *atomic.Bool
}

// ToolEvent is the camelCase payload the frontend reducer expects.
type ToolEvent struct {
	Type     string `json:"type"` // started | log | finished | failed | cancelled
	JobID    string `json:"jobId"`
	Kind     string `json:"kind"`             // backup | restore
	Stream   string `json:"stream,omitempty"` // stdout | stderr
	Line     string `json:"line,omitempty"`
	ExitCode *int   `json:"exitCode"`
	Message  string `json:"message,omitempty"`
}

func NewJobManager(emit func(event string, data any)) *JobManager {
	return &JobManager{emit: emit, jobs: map[string]*job{}}
}

func (m *JobManager) emitEvent(ev ToolEvent) {
	if m.emit != nil {
		m.emit("postgres-tool-event", ev)
	}
}

// StartBackup is start_backup_job.
func (m *JobManager) StartBackup(spec CommandSpec) (string, error) {
	return m.start("backup", spec)
}

// StartRestore is start_restore_job.
func (m *JobManager) StartRestore(spec CommandSpec) (string, error) {
	return m.start("restore", spec)
}

// Cancel kills a running job — the cancel_job command.
func (m *JobManager) Cancel(jobID string) error {
	m.mu.Lock()
	j, ok := m.jobs[jobID]
	m.mu.Unlock()
	if !ok {
		return errors.New("Backup or restore job was not found")
	}
	j.cancelled.Store(true)
	if j.cmd.Process != nil {
		return j.cmd.Process.Kill()
	}
	return nil
}

func (m *JobManager) start(kind string, spec CommandSpec) (string, error) {
	jobID := newJobID()
	cmd := exec.Command(spec.Program, spec.Args...)
	cmd.Env = append(cmd.Environ(), spec.Env...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", err
	}
	if err := cmd.Start(); err != nil {
		if isNotFound(err) {
			return "", fmt.Errorf("%s was not found in PATH. Install the PostgreSQL client tools and try again", spec.Program)
		}
		return "", err
	}

	cancelled := &atomic.Bool{}
	m.mu.Lock()
	m.jobs[jobID] = &job{cmd: cmd, cancelled: cancelled}
	m.mu.Unlock()

	go m.run(jobID, kind, spec, cmd, stdout, stderr, cancelled)
	return jobID, nil
}

func (m *JobManager) run(jobID, kind string, spec CommandSpec, cmd *exec.Cmd, stdout, stderr io.Reader, cancelled *atomic.Bool) {
	m.emitEvent(ToolEvent{Type: "started", JobID: jobID, Kind: kind, Message: spec.StartedMessage})

	var lastStderr atomic.Value // string
	var wg sync.WaitGroup
	stream := func(r io.Reader, name string, trackLast bool) {
		defer wg.Done()
		scanner := bufio.NewScanner(r)
		scanner.Buffer(make([]byte, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			if trackLast {
				lastStderr.Store(line)
			}
			m.emitEvent(ToolEvent{Type: "log", JobID: jobID, Kind: kind, Stream: name, Line: line})
		}
	}
	wg.Add(2)
	go stream(stdout, "stdout", false)
	go stream(stderr, "stderr", true)
	waitErr := cmd.Wait()
	wg.Wait()

	m.mu.Lock()
	delete(m.jobs, jobID)
	m.mu.Unlock()

	program := spec.Program
	if cancelled.Load() {
		m.emitEvent(ToolEvent{Type: "cancelled", JobID: jobID, Kind: kind, Message: program + " cancelled"})
		return
	}
	if waitErr == nil {
		code := 0
		m.emitEvent(ToolEvent{Type: "finished", JobID: jobID, Kind: kind, ExitCode: &code, Message: program + " completed successfully"})
		return
	}
	var exitCode *int
	var lastLine *string
	if v, ok := lastStderr.Load().(string); ok {
		lastLine = &v
	}
	if exitErr, ok := waitErr.(*exec.ExitError); ok {
		code := exitErr.ExitCode()
		exitCode = &code
	}
	m.emitEvent(ToolEvent{Type: "failed", JobID: jobID, Kind: kind, ExitCode: exitCode, Message: failureMessage(program, lastLine, exitCode)})
}

func isNotFound(err error) bool {
	var execErr *exec.Error
	return errors.As(err, &execErr) && errors.Is(execErr.Err, exec.ErrNotFound)
}

// failureMessage ports failure_message: auth/archive hints from the last
// stderr line, else a generic exit-code message.
func failureMessage(toolName string, lastError *string, exitCode *int) string {
	if lastError != nil {
		lowered := strings.ToLower(*lastError)
		if strings.Contains(lowered, "password authentication failed") || strings.Contains(lowered, "fe_sendauth") {
			return "Authentication failed. Check the saved PostgreSQL username/password."
		}
		if strings.Contains(lowered, "not a valid archive") || strings.Contains(lowered, "input file appears to be a text format dump") {
			return "The selected dump format does not match the restore tool. Use a plain .sql file with psql or a .dump/.tar archive with pg_restore."
		}
		return *lastError
	}
	if exitCode != nil {
		return fmt.Sprintf("%s exited with code %d. Review the command output above.", toolName, *exitCode)
	}
	return toolName + " failed before an exit code was reported."
}

var jobCounter atomic.Int64

func newJobID() string {
	// UUID shape isn't required — unique + opaque is enough (matches the
	// Rust Uuid only as an id, nothing parses it).
	return fmt.Sprintf("job-%d-%d", time.Now().UnixNano(), jobCounter.Add(1))
}
