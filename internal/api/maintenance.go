package api

import (
	"github.com/asta-nguyen/kamehadb/internal/maintenance"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// MaintenanceService replaces the start_postgres_backup /
// start_postgres_restore / cancel_postgres_job Tauri commands. Job progress
// streams on `postgres-tool-event`.
type MaintenanceService struct {
	st   *store.Store
	jobs *maintenance.JobManager
}

func NewMaintenanceService(st *store.Store, emit func(event string, data any)) *MaintenanceService {
	return &MaintenanceService{st: st, jobs: maintenance.NewJobManager(emit)}
}

// StartPostgresBackup — the start_postgres_backup command.
func (s *MaintenanceService) StartPostgresBackup(req maintenance.StartBackupRequest) (map[string]string, error) {
	profile, err := maintenance.LoadPostgresProfile(s.st, req.ConnectionID)
	if err != nil {
		return nil, err
	}
	jobID, err := s.jobs.StartBackup(maintenance.BuildBackupCommand(profile, req))
	if err != nil {
		return nil, err
	}
	return map[string]string{"jobId": jobID}, nil
}

// StartPostgresRestore — the start_postgres_restore command.
func (s *MaintenanceService) StartPostgresRestore(req maintenance.StartRestoreRequest) (map[string]string, error) {
	profile, err := maintenance.LoadPostgresProfile(s.st, req.ConnectionID)
	if err != nil {
		return nil, err
	}
	spec, err := maintenance.BuildRestoreCommand(profile, req)
	if err != nil {
		return nil, err
	}
	jobID, err := s.jobs.StartRestore(spec)
	if err != nil {
		return nil, err
	}
	return map[string]string{"jobId": jobID}, nil
}

// CancelPostgresJob — the cancel_postgres_job command.
func (s *MaintenanceService) CancelPostgresJob(jobID string) error {
	return s.jobs.Cancel(jobID)
}
