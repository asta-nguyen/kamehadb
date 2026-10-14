package duckdriver

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const (
	testJobTimeout    = 2 * time.Second
	testCancelTimeout = 50 * time.Millisecond
)

type testAdapter struct{ engines.UnsupportedAdapter }

func (a *testAdapter) RunQuery(ctx context.Context, input engines.RunQueryInput) (*engines.QueryResult, error) {
	switch input.Query {
	case "slow":
		<-ctx.Done()
		return nil, ctx.Err()
	case "crash":
		os.Exit(17)
	case "hang":
		select {}
	case "oversized-frame":
		fmt.Println(strings.Repeat("x", MaxMessageBytes+1))
	case "stderr":
		fmt.Fprint(os.Stderr, strings.Repeat("x", MaxStderrBytes*3))
	}
	return &engines.QueryResult{Rows: []map[string]any{{"exact": "9007199254740993", "n": 7}}, RowCount: 1}, nil
}

// A subprocess, not an in-process mock, exercises framing, crashes, pipe
// cleanup, acknowledgement and stderr under the same exec lifecycle.
func TestDriverProcess(t *testing.T) {
	mode := os.Getenv("KAMEHADB_TEST_DRIVER_PROCESS")
	if mode == "" {
		return
	}
	if mode == "bad-json" {
		fmt.Println("not-json")
		os.Exit(0)
	}
	if mode == "incompatible" {
		scanner := bufio.NewScanner(os.Stdin)
		for scanner.Scan() {
			var req Request
			_ = Decode(scanner.Bytes(), &req)
			result, _ := json.Marshal(Handshake{Protocol: ProtocolVersion + 1, Version: ReleaseVersion})
			data, _ := json.Marshal(Response{ID: req.ID, Result: result})
			fmt.Println(string(data))
		}
		os.Exit(0)
	}
	err := Serve(context.Background(), os.Stdin, os.Stdout,
		func(context.Context, OpenInput) (engines.SQLAdapter, error) { return &testAdapter{}, nil })
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	os.Exit(0)
}

func processCommand(t *testing.T, mode string) *exec.Cmd {
	t.Helper()
	path, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(path, "-test.run=^TestDriverProcess$")
	cmd.Env = append(os.Environ(), "KAMEHADB_TEST_DRIVER_PROCESS="+mode)
	return cmd
}

func TestClientCancellationIndependentRequestsAndExactValues(t *testing.T) {
	ctx, stop := context.WithTimeout(context.Background(), testJobTimeout)
	defer stop()
	client, err := startCommand(ctx, processCommand(t, "normal"), OpenInput{})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	cancelled, cancel := context.WithCancel(ctx)
	slow := make(chan error, 1)
	go func() { slow <- client.Call(cancelled, MethodQuery, engines.RunQueryInput{Query: "slow"}, nil) }()
	var result engines.QueryResult
	if err := client.Call(ctx, MethodQuery, engines.RunQueryInput{Query: "fast"}, &result); err != nil {
		t.Fatal(err)
	}
	if result.Rows[0]["exact"] != "9007199254740993" || result.Rows[0]["n"] != json.Number("7") {
		t.Fatalf("lossy RPC: %+v", result)
	}
	cancel()
	if err := <-slow; !errors.Is(err, context.Canceled) {
		t.Fatalf("cancel: %v", err)
	}
	if err := client.Call(ctx, MethodQuery, engines.RunQueryInput{Query: "fast"}, &result); err != nil {
		t.Fatalf("reuse after cancellation: %v", err)
	}
	if err := client.Close(); err != nil {
		t.Fatalf("graceful close: %v", err)
	}
	select {
	case <-client.waitDone:
	default:
		t.Fatal("worker not reaped")
	}
}

func TestClientBrokenWorkerIsNotReplayed(t *testing.T) {
	ctx, stop := context.WithTimeout(context.Background(), testJobTimeout)
	defer stop()
	client, err := startCommand(ctx, processCommand(t, "normal"), OpenInput{})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	if err := client.Call(ctx, MethodQuery, engines.RunQueryInput{Query: "crash"}, nil); err == nil {
		t.Fatal("crashed worker succeeded")
	}
	if err := client.Call(ctx, MethodQuery, engines.RunQueryInput{Query: "fast"}, nil); err == nil {
		t.Fatal("dead worker was restarted")
	}
	select {
	case <-client.waitDone:
	case <-ctx.Done():
		t.Fatal("crashed child leaked")
	}
}

func TestClientHandshakeAndFramingFailures(t *testing.T) {
	for _, mode := range []string{"incompatible", "bad-json"} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), testJobTimeout)
			defer cancel()
			cmd := processCommand(t, mode)
			if client, err := startCommand(ctx, cmd, OpenInput{}); err == nil {
				client.Close()
				t.Fatal("invalid worker accepted")
			}
			if cmd.ProcessState == nil {
				t.Fatal("failed startup child was not reaped")
			}
		})
	}
}

// Force a worker that ignores cancellation to terminate. Native interruption
// remains a separate real-helper test; this proves the failure path cannot leak.
func TestClientUnresponsiveAndOversizedWorker(t *testing.T) {
	for _, query := range []string{"hang", "oversized-frame"} {
		t.Run(query, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), StopTimeout+testJobTimeout)
			defer cancel()
			client, err := startCommand(ctx, processCommand(t, "normal"), OpenInput{})
			if err != nil {
				t.Fatal(err)
			}
			defer client.Close()
			short, stop := context.WithTimeout(ctx, testCancelTimeout)
			err = client.Call(short, MethodQuery, engines.RunQueryInput{Query: query}, nil)
			stop()
			if err == nil {
				t.Fatal("invalid/unresponsive worker succeeded")
			}
			select {
			case <-client.waitDone:
			case <-ctx.Done():
				t.Fatal("broken child leaked")
			}
		})
	}
}

func TestClientStderrAndRequestBounds(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), testJobTimeout)
	defer cancel()
	client, err := startCommand(ctx, processCommand(t, "normal"), OpenInput{})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	if err := client.Call(ctx, MethodQuery, engines.RunQueryInput{Query: "stderr"}, nil); err != nil {
		t.Fatal(err)
	}
	if err := client.Call(ctx, MethodQuery, engines.RunQueryInput{Query: strings.Repeat("x", MaxMessageBytes)}, nil); err == nil {
		t.Fatal("oversized request accepted")
	}
	if err := client.Close(); err != nil {
		t.Fatal(err)
	}
	if got := len(client.stderr.String()); got != MaxStderrBytes {
		t.Fatalf("stderr tail %d", got)
	}
}
