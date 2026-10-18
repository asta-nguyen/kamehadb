package api

import "github.com/asta-nguyen/kamehadb/internal/logs"

// LogsService exposes the unified app log over Wails — append_frontend_log,
// read_app_logs, and clear_app_logs from app_logs.rs.
type LogsService struct{}

func NewLogsService() *LogsService { return &LogsService{} }

// AppendFrontendLog persists a browser-forwarded entry to frontend.log.
func (s *LogsService) AppendFrontendLog(entry logs.FrontendInput) error {
	return logs.AppendFrontend(entry)
}

// ReadAppLogs returns the merged, newest-first log snapshot.
func (s *LogsService) ReadAppLogs(limit int) (*logs.Snapshot, error) {
	return logs.ReadSnapshot(limit)
}

// ClearAppLogs truncates every producer log file.
func (s *LogsService) ClearAppLogs() error { return logs.Clear() }
