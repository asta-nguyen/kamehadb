package api

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	_ "github.com/asta-nguyen/kamehadb/internal/engines/postgres"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	requestNativeTimeout = 5 * time.Second
	requestNativePoll    = 10 * time.Millisecond
)

type requestNativeLoader struct{ profile engines.ConnProfile }

func (loader requestNativeLoader) ProfileForConnect(string) (engines.ConnProfile, error) {
	return loader.profile, nil
}

// Observe two real server statements before cancelling one ID. No persistent
// tables/profiles are created, and the other same-connection job must survive.
func TestNativePostgresGUIRequestCancellation(t *testing.T) {
	url := os.Getenv("KAMEHADB_TEST_POSTGRES")
	if url == "" {
		t.Skip("KAMEHADB_TEST_POSTGRES not set")
	}
	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), requestNativeTimeout)
	defer cancel()
	monitor, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer monitor.Close(context.Background())
	registry := engines.NewRegistry(requestNativeLoader{engines.ConnProfile{
		Kind: engines.KindPostgres, Host: cfg.Host, Port: int64(cfg.Port), Database: cfg.Database,
		Username: cfg.User, Password: cfg.Password, HasPassword: true, SSL: cfg.TLSConfig != nil,
	}})
	defer registry.Close()
	service := NewSqlService(registry, newTTLCache())
	defer service.requests.close()
	oneID, twoID := uuid.NewString(), uuid.NewString()
	marker := "kameha-request-" + uuid.NewString()
	one, two := make(chan error, 1), make(chan error, 1)
	go func() {
		_, err := service.RunQuery("same", engines.RunQueryInput{Query: "SELECT pg_sleep(30) /*" + marker + "-one*/", RequestID: &oneID})
		one <- err
	}()
	go func() {
		_, err := service.RunQuery("same", engines.RunQueryInput{Query: "SELECT pg_sleep(30) /*" + marker + "-two*/", RequestID: &twoID})
		two <- err
	}()
	active := func(pattern string) int {
		var count int
		if err := monitor.QueryRow(ctx, "SELECT count(*) FROM pg_stat_activity WHERE state='active' AND query LIKE $1", "%"+pattern+"%").Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}
	for active(marker) != 2 {
		if ctx.Err() != nil {
			t.Fatal("two native statements never became active")
		}
		time.Sleep(requestNativePoll)
	}
	if ok, err := service.CancelRequest(oneID); !ok || err != nil {
		t.Fatal(ok, err)
	}
	select {
	case err := <-one:
		if err == nil {
			t.Fatal("cancelled native request succeeded")
		}
	case <-ctx.Done():
		t.Fatal("native request did not terminate")
	}
	for active(marker+"-one") != 0 {
		time.Sleep(requestNativePoll)
	}
	if active(marker+"-two") != 1 {
		t.Fatal("cancellation stopped another tab's native statement")
	}
	if ok, err := service.CancelRequest(twoID); !ok || err != nil {
		t.Fatal(ok, err)
	}
	select {
	case err := <-two:
		if err == nil {
			t.Fatal("second cancellation ignored")
		}
	case <-ctx.Done():
		t.Fatal("second native request did not terminate")
	}
	result, err := service.RunQuery("same", engines.RunQueryInput{Query: "SELECT 42 AS value"})
	if err != nil || len(result.Rows) != 1 || result.Rows[0]["value"] != int32(42) {
		t.Fatal("pool unusable after cancellation", result, err)
	}
}
