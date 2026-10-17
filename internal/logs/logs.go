// Package logs is the unified app log: a JSON-lines file logger replacing
// the sidecar's pino multistream (stdout + <dataDir>/logs/app.log) plus the
// merged tail reader behind the in-app Logs page.
//
// Producers: frontend.log (browser-forwarded entries) and app.log (this Go
// backend). Legacy tauri.log and sidecar.log files are still merged on read
// so history from the pre-Wails install isn't lost.
package logs

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const (
	frontendLogFile = "frontend.log"
	appLogFile      = "app.log"
	tauriLogFile    = "tauri.log"
	sidecarLogFile  = "sidecar.log"
	maxTailBytes    = 256 * 1024
)

// Entry mirrors AppLogEntry from app_logs.rs.
type Entry struct {
	TimestampMs int64   `json:"timestampMs"`
	Level       string  `json:"level"`
	Source      string  `json:"source"`
	Message     string  `json:"message"`
	Scope       *string `json:"scope,omitempty"`
	Details     *string `json:"details,omitempty"`
	Stack       *string `json:"stack,omitempty"`
	URL         *string `json:"url,omitempty"`
}

var (
	mu     sync.Mutex
	logDir string
)

// Init points the logger at <dataDir>/logs and primes the directory.
func Init(dataDir string) error {
	dir := filepath.Join(dataDir, "logs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	mu.Lock()
	logDir = dir
	mu.Unlock()
	return nil
}

// Dir returns the active log directory ("" before Init).
func Dir() string {
	mu.Lock()
	defer mu.Unlock()
	return logDir
}

// Log writes one app.log entry and mirrors it to stdout like pino did.
func Log(level, scope, message, details string) {
	entry := Entry{
		TimestampMs: nowMs(),
		Level:       level,
		Source:      "app",
		Message:     message,
	}
	if scope != "" {
		entry.Scope = &scope
	}
	if details != "" {
		entry.Details = &details
	}
	appendEntry(appLogFile, entry)
	if details != "" {
		log.Printf("[%s] %s: %s", level, scope, details)
	} else {
		log.Printf("[%s] %s", level, message)
	}
}

func Info(scope, message string)  { Log("info", scope, message, "") }
func Warn(scope, message string)  { Log("warn", scope, message, "") }
func Error(scope, message string) { Log("error", scope, message, "") }
func Debug(scope, message string) { Log("debug", scope, message, "") }

// FrontendInput is the append_frontend_log payload.
type FrontendInput struct {
	TimestampMs *int64  `json:"timestampMs,omitempty"`
	Level       string  `json:"level"`
	Message     string  `json:"message"`
	Scope       *string `json:"scope,omitempty"`
	Details     *string `json:"details,omitempty"`
	Stack       *string `json:"stack,omitempty"`
	URL         *string `json:"url,omitempty"`
}

// AppendFrontend persists a browser-forwarded entry to frontend.log.
func AppendFrontend(in FrontendInput) error {
	ts := nowMs()
	if in.TimestampMs != nil {
		ts = *in.TimestampMs
	}
	return appendEntry(frontendLogFile, Entry{
		TimestampMs: ts,
		Level:       in.Level,
		Source:      "frontend",
		Message:     in.Message,
		Scope:       in.Scope,
		Details:     in.Details,
		Stack:       in.Stack,
		URL:         in.URL,
	})
}

// Append is the Go-side append for services that produce structured entries.
func Append(source string, entry Entry) error {
	entry.Source = source
	if entry.TimestampMs == 0 {
		entry.TimestampMs = nowMs()
	}
	return appendEntry(appLogFile, entry)
}

func appendEntry(fileName string, entry Entry) error {
	mu.Lock()
	defer mu.Unlock()
	if logDir == "" {
		return nil // pre-Init logging goes nowhere, like a dropped pino line
	}
	record, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(filepath.Join(logDir, fileName), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(append(record, '\n'))
	return err
}

// Snapshot is the read_app_logs response.
type Snapshot struct {
	Entries []Entry `json:"entries"`
	LogDir  string  `json:"logDir"`
}

// ReadSnapshot merges the tail of every producer file, newest first —
// read_app_logs ported with the 256KB tail window.
func ReadSnapshot(limit int) (*Snapshot, error) {
	mu.Lock()
	dir := logDir
	mu.Unlock()
	if dir == "" {
		return &Snapshot{Entries: []Entry{}, LogDir: ""}, nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 300
	}

	var entries []Entry
	entries = append(entries, readNativeLog(filepath.Join(dir, frontendLogFile), limit)...)
	entries = append(entries, readNativeLog(filepath.Join(dir, appLogFile), limit)...)
	// Legacy producers from the Tauri era — still readable for history.
	entries = append(entries, readNativeLog(filepath.Join(dir, tauriLogFile), limit)...)
	entries = append(entries, readSidecarLog(filepath.Join(dir, sidecarLogFile), limit)...)

	sort.Slice(entries, func(i, j int) bool { return entries[i].TimestampMs > entries[j].TimestampMs })
	if len(entries) > limit {
		entries = entries[:limit]
	}
	return &Snapshot{Entries: entries, LogDir: dir}, nil
}

// Clear truncates every producer file — the clear_app_logs command.
func Clear() error {
	mu.Lock()
	dir := logDir
	mu.Unlock()
	if dir == "" {
		return nil
	}
	for _, name := range []string{frontendLogFile, appLogFile, tauriLogFile, sidecarLogFile} {
		path := filepath.Join(dir, name)
		if _, err := os.Stat(path); err == nil {
			if err := os.WriteFile(path, nil, 0o644); err != nil {
				return err
			}
		}
	}
	return nil
}

func nowMs() int64 { return time.Now().UnixMilli() }

// readNativeLog tails a JSON-lines file of Entry records.
func readNativeLog(path string, limit int) []Entry {
	lines, err := readLastLines(path, limit)
	if err != nil {
		return nil
	}
	var out []Entry
	for _, line := range lines {
		var e Entry
		if json.Unmarshal([]byte(line), &e) == nil {
			out = append(out, e)
		}
	}
	return out
}

// readSidecarLog tails a pino-shaped file and normalizes each record — kept
// for legacy sidecar.log files.
func readSidecarLog(path string, limit int) []Entry {
	lines, err := readLastLines(path, limit)
	if err != nil {
		return nil
	}
	var out []Entry
	for _, line := range lines {
		if e, ok := parseSidecarLine(line); ok {
			out = append(out, e)
		}
	}
	return out
}

// readLastLines keeps only the newest `limit` lines — a bounded reverse scan
// of the last 256KB, like read_last_lines in app_logs.rs.
func readLastLines(path string, limit int) ([]string, error) {
	if limit <= 0 {
		return nil, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	start, err := findTailStart(f, limit)
	if err != nil {
		return nil, err
	}
	if start > 0 && midRecord(f, start) {
		// min_start fell inside a record — advance to the next newline.
		if _, err := f.Seek(start, io.SeekStart); err != nil {
			return nil, err
		}
		reader := bufio.NewReader(f)
		for {
			b, err := reader.ReadByte()
			if err != nil {
				break
			}
			start++
			if b == '\n' {
				break
			}
		}
	}
	if _, err := f.Seek(start, io.SeekStart); err != nil {
		return nil, err
	}

	lines := make([]string, 0, limit)
	reader := bufio.NewReader(f)
	for {
		line, err := reader.ReadString('\n')
		if len(line) > 0 {
			trimmed := trimNewline(line)
			if len(lines) == limit {
				lines = lines[1:]
			}
			lines = append(lines, trimmed)
		}
		if err != nil {
			break
		}
	}
	return lines, nil
}

func trimNewline(s string) string {
	for len(s) > 0 && (s[len(s)-1] == '\n' || s[len(s)-1] == '\r') {
		s = s[:len(s)-1]
	}
	return s
}

// midRecord reports whether pos sits inside a record (the byte before it is
// not a line boundary).
func midRecord(f *os.File, pos int64) bool {
	if _, err := f.Seek(pos-1, io.SeekStart); err != nil {
		return false
	}
	var b [1]byte
	if _, err := f.Read(b[:]); err != nil {
		return false
	}
	return b[0] != '\n'
}

func findTailStart(f *os.File, limit int) (int64, error) {
	const chunkSize = 8 * 1024
	info, err := f.Stat()
	if err != nil {
		return 0, err
	}
	fileLen := info.Size()
	if fileLen == 0 {
		return 0, nil
	}
	minStart := fileLen - maxTailBytes
	if minStart < 0 {
		minStart = 0
	}
	position := fileLen
	seenLines := 0
	for position > minStart {
		remaining := position - minStart
		chunk := remaining
		if chunk > chunkSize {
			chunk = chunkSize
		}
		position -= chunk
		if _, err := f.Seek(position, io.SeekStart); err != nil {
			return 0, err
		}
		buf := make([]byte, chunk)
		if _, err := io.ReadFull(f, buf); err != nil {
			return 0, err
		}
		for i := len(buf) - 1; i >= 0; i-- {
			if buf[i] != '\n' {
				continue
			}
			newlineOffset := position + int64(i)
			if newlineOffset+1 == fileLen {
				continue
			}
			seenLines++
			if seenLines >= limit {
				return newlineOffset + 1, nil
			}
		}
	}
	return minStart, nil
}

// parseSidecarLine normalizes one pino record — the legacy sidecar format.
func parseSidecarLine(line string) (Entry, bool) {
	var value map[string]any
	if json.Unmarshal([]byte(line), &value) != nil {
		return Entry{}, false
	}
	var ts int64
	switch raw := value["time"].(type) {
	case float64:
		ts = int64(raw)
	case string:
		if n, err := fmt.Sscanf(raw, "%d", &ts); n == 0 || err != nil {
			var parsed int64
			if _, err := fmt.Sscan(raw, &parsed); err == nil {
				ts = parsed
			}
		}
	}
	if ts == 0 {
		return Entry{}, false
	}
	message, _ := value["msg"].(string)
	if message == "" {
		message = "Sidecar log event"
	}
	var details *string
	if errVal, ok := value["err"]; ok {
		if raw, err := json.Marshal(errVal); err == nil {
			s := string(raw)
			details = &s
		}
	} else if s := collapseSidecarDetails(value); s != "" {
		details = &s
	}
	var scope *string
	if s, ok := value["scope"].(string); ok {
		scope = &s
	}
	return Entry{
		TimestampMs: ts,
		Level:       mapSidecarLevel(value["level"]),
		Source:      "sidecar",
		Message:     message,
		Scope:       scope,
		Details:     details,
	}, true
}

func collapseSidecarDetails(value map[string]any) string {
	obj := map[string]any{}
	for k, v := range value {
		obj[k] = v
	}
	for _, key := range []string{"level", "time", "pid", "hostname", "msg", "scope"} {
		delete(obj, key)
	}
	if len(obj) == 0 {
		return ""
	}
	raw, err := json.Marshal(obj)
	if err != nil {
		return ""
	}
	return string(raw)
}

func mapSidecarLevel(level any) string {
	n, _ := level.(float64)
	switch int(n) {
	case 60:
		return "fatal"
	case 50:
		return "error"
	case 40:
		return "warn"
	case 30:
		return "info"
	case 20:
		return "debug"
	case 10:
		return "trace"
	}
	return "info"
}
