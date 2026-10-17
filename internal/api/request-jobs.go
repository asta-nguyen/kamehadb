package api

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	maxGUIRequests         = 16
	maxEarlyRequestCancels = 64
	maxRequestIDBytes      = 128
	earlyRequestCancelTTL  = time.Minute
)

type requestJob struct {
	id           string
	connectionID string
	ctx          context.Context
	cancel       context.CancelFunc
}

// One bounded owner is shared by SQL/Mongo/Redis services. Exports remain
// independent; completing an older job cannot remove a newer job's cancel.
type requestJobs struct {
	mu     sync.Mutex
	root   context.Context
	stop   context.CancelFunc
	closed bool
	active map[string]*requestJob
	early  map[string]time.Time
	wg     sync.WaitGroup
}

func newRequestJobs() *requestJobs {
	root, stop := context.WithCancel(context.Background())
	return &requestJobs{root: root, stop: stop, active: make(map[string]*requestJob), early: make(map[string]time.Time)}
}

// Wails supplies the lifecycle parent; constructors also work in isolated tests.
func (jobs *requestJobs) start(parent context.Context) {
	jobs.mu.Lock()
	defer jobs.mu.Unlock()
	jobs.stop()
	jobs.root, jobs.stop = context.WithCancel(parent)
}

func validRequestID(id string) bool {
	return strings.TrimSpace(id) != "" && len(id) <= maxRequestIDBytes
}

// Register before any adapter lookup or command. A missing legacy ID still
// participates; explicit invalid IDs and overload execute no database action.
func (jobs *requestJobs) begin(connectionID string, supplied *string) (*requestJob, error) {
	var id string
	if supplied == nil {
		id = uuid.NewString()
	} else {
		id = *supplied
	}
	if !validRequestID(id) {
		return nil, errors.New("Invalid request ID")
	}
	jobs.mu.Lock()
	defer jobs.mu.Unlock()
	if jobs.closed || jobs.root.Err() != nil {
		return nil, errors.New("Application is shutting down")
	}
	if _, exists := jobs.active[id]; exists {
		return nil, errors.New("Request ID is already running")
	}
	if len(jobs.active) >= maxGUIRequests {
		return nil, errors.New("Too many GUI requests are running; no database action was executed")
	}
	if at, exists := jobs.early[id]; exists {
		delete(jobs.early, id)
		if time.Since(at) < earlyRequestCancelTTL {
			return nil, context.Canceled
		}
	}
	ctx, cancel := context.WithCancel(jobs.root)
	job := &requestJob{id: id, connectionID: connectionID, ctx: ctx, cancel: cancel}
	jobs.active[id] = job
	jobs.wg.Add(1)
	return job, nil
}

func (jobs *requestJobs) finish(job *requestJob) {
	job.cancel()
	jobs.mu.Lock()
	if jobs.active[job.id] == job {
		delete(jobs.active, job.id)
	}
	jobs.mu.Unlock()
	jobs.wg.Done()
}

// Tombstones cover Wails scheduling where Cancel arrives before the call.
// Unknown cancellation cannot grow an unbounded registry or outlive its TTL.
func (jobs *requestJobs) cancel(id string) (bool, error) {
	if !validRequestID(id) {
		return false, errors.New("Invalid request ID")
	}
	jobs.mu.Lock()
	defer jobs.mu.Unlock()
	if jobs.closed {
		return false, nil
	}
	if job := jobs.active[id]; job != nil {
		job.cancel()
		return true, nil
	}
	for pending, at := range jobs.early {
		if time.Since(at) >= earlyRequestCancelTTL {
			delete(jobs.early, pending)
		}
	}
	if _, exists := jobs.early[id]; !exists && len(jobs.early) >= maxEarlyRequestCancels {
		return false, nil
	}
	jobs.early[id] = time.Now()
	return true, nil
}

// Profile changes cancel matching jobs before their cached adapters are closed.
func (jobs *requestJobs) cancelConnection(id string) {
	jobs.mu.Lock()
	defer jobs.mu.Unlock()
	for _, job := range jobs.active {
		if job.connectionID == id {
			job.cancel()
		}
	}
}

// Reject new work, cancel the root, then wait for native calls to release owners.
func (jobs *requestJobs) close() {
	jobs.mu.Lock()
	jobs.closed = true
	jobs.stop()
	clear(jobs.early)
	jobs.mu.Unlock()
	jobs.wg.Wait()
}
