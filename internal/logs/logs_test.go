package logs

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppendAndRead(t *testing.T) {
	dir := t.TempDir()
	if err := Init(dir); err != nil {
		t.Fatal(err)
	}
	Info("test", "hello backend")
	if err := AppendFrontend(FrontendInput{Level: "error", Message: "frontend broke"}); err != nil {
		t.Fatal(err)
	}

	snap, err := ReadSnapshot(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(snap.Entries) != 2 {
		t.Fatalf("want 2 entries, got %d", len(snap.Entries))
	}
	sources := map[string]bool{}
	for _, e := range snap.Entries {
		sources[e.Source] = true
	}
	if !sources["app"] || !sources["frontend"] {
		t.Fatalf("missing sources: %v", sources)
	}
	// Newest first
	if snap.Entries[0].TimestampMs < snap.Entries[1].TimestampMs {
		t.Fatal("entries not sorted newest-first")
	}
}

func TestTailWindow(t *testing.T) {
	dir := t.TempDir()
	if err := Init(dir); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 500; i++ {
		Info("test", fmt.Sprintf("line-%d", i))
	}
	snap, err := ReadSnapshot(50)
	if err != nil {
		t.Fatal(err)
	}
	if len(snap.Entries) != 50 {
		t.Fatalf("want 50 entries, got %d", len(snap.Entries))
	}
	// All writes share one millisecond, so same-ts order is arbitrary — assert
	// the window is the newest 50 lines as a set.
	got := map[string]bool{}
	for _, e := range snap.Entries {
		got[e.Message] = true
	}
	for i := 450; i < 500; i++ {
		if !got[fmt.Sprintf("line-%d", i)] {
			t.Fatalf("missing line-%d from tail window", i)
		}
	}
}

func TestLegacySidecarParse(t *testing.T) {
	dir := t.TempDir()
	if err := Init(dir); err != nil {
		t.Fatal(err)
	}
	line := `{"level":40,"time":1700000000000,"pid":1,"msg":"slow query","scope":"sql","rows":42}` + "\n"
	if err := os.WriteFile(filepath.Join(dir, "logs", sidecarLogFile), []byte(line), 0o644); err != nil {
		t.Fatal(err)
	}
	snap, err := ReadSnapshot(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(snap.Entries) != 1 {
		t.Fatalf("want 1 entry, got %d", len(snap.Entries))
	}
	e := snap.Entries[0]
	if e.Level != "warn" || e.Source != "sidecar" || e.Message != "slow query" {
		t.Fatalf("bad normalization: %+v", e)
	}
	if e.Details == nil || !strings.Contains(*e.Details, "rows") {
		t.Fatalf("collapsed details missing: %+v", e.Details)
	}
}

func TestClear(t *testing.T) {
	dir := t.TempDir()
	if err := Init(dir); err != nil {
		t.Fatal(err)
	}
	Info("test", "gone soon")
	if err := Clear(); err != nil {
		t.Fatal(err)
	}
	snap, err := ReadSnapshot(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(snap.Entries) != 0 {
		t.Fatalf("want 0 entries after clear, got %d", len(snap.Entries))
	}
}
