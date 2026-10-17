package api

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

const requestTestTimeout = time.Second

func TestRequestJobsIndependentCompletionAndEarlyCancel(t *testing.T) {
	jobs := newRequestJobs()
	firstID, secondID := "first", "second"
	first, err := jobs.begin("same-connection", &firstID)
	if err != nil {
		t.Fatal(err)
	}
	second, err := jobs.begin("same-connection", &secondID)
	if err != nil {
		t.Fatal(err)
	}
	jobs.finish(first)
	if accepted, err := jobs.cancel(secondID); !accepted || err != nil || second.ctx.Err() != context.Canceled {
		t.Fatal(accepted, err, second.ctx.Err())
	}
	jobs.finish(second)
	earlyID := "not-registered-yet"
	if accepted, err := jobs.cancel(earlyID); !accepted || err != nil {
		t.Fatal(accepted, err)
	}
	if job, err := jobs.begin("connection", &earlyID); !errors.Is(err, context.Canceled) || job != nil {
		t.Fatal("early cancellation lost", job, err)
	}
	legacy, err := jobs.begin("legacy", nil)
	if err != nil || legacy.id == "" {
		t.Fatal(legacy, err)
	}
	jobs.finish(legacy)
	jobs.close()
}

func TestRequestJobsInvalidOverloadAndBoundedTombstones(t *testing.T) {
	jobs := newRequestJobs()
	for _, id := range []string{"", " ", strings.Repeat("x", maxRequestIDBytes+1)} {
		if _, err := jobs.begin("connection", &id); err == nil {
			t.Fatalf("invalid ID accepted %q", id)
		}
		if _, err := jobs.cancel(id); err == nil {
			t.Fatalf("invalid cancellation accepted %q", id)
		}
	}
	active := make([]*requestJob, 0, maxGUIRequests)
	for i := range maxGUIRequests {
		id := fmt.Sprintf("request-%d", i)
		job, err := jobs.begin("connection", &id)
		if err != nil {
			t.Fatal(err)
		}
		active = append(active, job)
	}
	if _, err := jobs.begin("connection", &active[0].id); err == nil {
		t.Fatal("duplicate request accepted")
	}
	if _, err := jobs.begin("connection", nil); err == nil {
		t.Fatal("unbounded active requests")
	}
	for _, job := range active {
		jobs.finish(job)
	}
	for i := range maxEarlyRequestCancels {
		if ok, err := jobs.cancel(fmt.Sprintf("early-%d", i)); !ok || err != nil {
			t.Fatal(ok, err)
		}
	}
	if ok, err := jobs.cancel("overflow"); ok || err != nil {
		t.Fatal("unbounded early records", ok, err)
	}
	jobs.mu.Lock()
	jobs.early["early-0"] = time.Now().Add(-earlyRequestCancelTTL)
	jobs.mu.Unlock()
	if ok, err := jobs.cancel("after-expiry"); !ok || err != nil {
		t.Fatal("expired record not pruned", ok, err)
	}
	jobs.close()
}

func TestRequestJobsProfileAndShutdownRoot(t *testing.T) {
	jobs := newRequestJobs()
	root, stop := context.WithCancel(context.Background())
	jobs.start(root)
	one, _ := jobs.begin("one", nil)
	two, _ := jobs.begin("two", nil)
	jobs.cancelConnection("one")
	if one.ctx.Err() != context.Canceled || two.ctx.Err() != nil {
		t.Fatal("cancelled unrelated profile")
	}
	jobs.finish(one)
	stop()
	if two.ctx.Err() != context.Canceled {
		t.Fatal("root cancellation not propagated")
	}
	jobs.finish(two)
	jobs.close()
	if _, err := jobs.begin("closed", nil); err == nil {
		t.Fatal("shutdown admitted work")
	}
}
