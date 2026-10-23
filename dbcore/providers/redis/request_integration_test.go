package redis

import (
	"context"
	"net"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

const (
	redisRequestTestTimeout = 2 * time.Second
	redisRequestTestPoll    = 5 * time.Millisecond
	redisOtherRequestWait   = 50 * time.Millisecond
)

// Use only the opt-in private server. BLPOP blocks individual sockets, unlike
// DEBUG SLEEP which would stop the whole server and falsify independence.
func TestNativeRedisRequestCancellationAndReuse(t *testing.T) {
	addr := os.Getenv("KAMEHADB_TEST_REDIS_ADDR")
	if addr == "" {
		t.Skip("KAMEHADB_TEST_REDIS_ADDR not set")
	}
	host, portString, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.ParseInt(portString, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	adapter := New(Config{Host: host, Port: port})
	defer adapter.Close()
	if adapter.client.Options().MaxRetries != 0 || !adapter.client.Options().ContextTimeoutEnabled {
		t.Fatal("ambiguous writes can retry or ignore deadlines")
	}
	ctxOne, cancelOne := context.WithCancel(context.Background())
	defer cancelOne()
	ctxTwo, cancelTwo := context.WithCancel(context.Background())
	defer cancelTwo()
	one, closeOne := adapter.ForRequest(ctxOne)
	defer closeOne()
	two, closeTwo := adapter.ForRequest(ctxTwo)
	defer closeTwo()
	keyOne, keyTwo := "kameha-private-request-one", "kameha-private-request-two"
	if err := adapter.client.Del(context.Background(), keyOne, keyTwo).Err(); err != nil {
		t.Fatal(err)
	}
	defer adapter.client.Del(context.Background(), keyOne, keyTwo)
	resultOne, resultTwo := make(chan error, 1), make(chan error, 1)
	go func() { _, err := one.RunCommand(ctxOne, "BLPOP "+keyOne+" 0"); resultOne <- err }()
	go func() { _, err := two.RunCommand(ctxTwo, "BLPOP "+keyTwo+" 0"); resultTwo <- err }()
	deadline := time.Now().Add(redisRequestTestTimeout)
	for {
		clients, err := adapter.client.ClientList(context.Background()).Result()
		if err != nil {
			t.Fatal(err)
		}
		if strings.Count(clients, "cmd=blpop") == 2 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("both private sockets did not enter BLPOP")
		}
		time.Sleep(redisRequestTestPoll)
	}
	cancelOne()
	select {
	case err := <-resultOne:
		if err == nil {
			t.Fatal("cancelled BLPOP succeeded")
		}
	case <-time.After(redisRequestTestTimeout):
		t.Fatal("native socket cancellation did not interrupt BLPOP")
	}
	select {
	case err := <-resultTwo:
		t.Fatal("cancellation interrupted another request", err)
	case <-time.After(redisOtherRequestWait):
	}
	if err := adapter.client.RPush(context.Background(), keyTwo, "complete").Err(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-resultTwo:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(redisRequestTestTimeout):
		t.Fatal("other native request stopped responding")
	}
	if err := adapter.client.Ping(context.Background()).Err(); err != nil {
		t.Fatal("shared pool unusable", err)
	}
	reopened, closeReopened := adapter.ForRequest(context.Background())
	defer closeReopened()
	if result, err := reopened.RunCommand(context.Background(), "PING"); err != nil || result.Result != "PONG" {
		t.Fatal("fresh owned pool unusable", result, err)
	}
}
