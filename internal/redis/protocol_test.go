package redis

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"reflect"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const protocolTestTimeout = 5 * time.Second

// fakeRedis answers just enough RESP to serve HELLO and HGETALL in whichever
// protocol version the client negotiates, so the test exercises the real client
// options without a Redis server. negotiated records the HELLO version.
type fakeRedis struct {
	addr       string
	negotiated atomic.Int32
}

func startFakeRedis(t *testing.T) *fakeRedis {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeRedis{addr: listener.Addr().String()}
	t.Cleanup(func() { listener.Close() })
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go f.serve(conn)
		}
	}()
	return f
}

// readCommand parses one RESP array of bulk strings.
func readCommand(r *bufio.Reader) ([]string, error) {
	header, err := r.ReadString('\n')
	if err != nil {
		return nil, err
	}
	count, err := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(header, "*")))
	if err != nil {
		return nil, fmt.Errorf("bad array header %q", header)
	}
	args := make([]string, 0, count)
	for i := 0; i < count; i++ {
		sizeLine, err := r.ReadString('\n')
		if err != nil {
			return nil, err
		}
		size, err := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(sizeLine, "$")))
		if err != nil {
			return nil, fmt.Errorf("bad bulk header %q", sizeLine)
		}
		buf := make([]byte, size+2)
		if _, err := io.ReadFull(r, buf); err != nil {
			return nil, err
		}
		args = append(args, string(buf[:size]))
	}
	return args, nil
}

func (f *fakeRedis) serve(conn net.Conn) {
	defer conn.Close()
	reader := bufio.NewReader(conn)
	protocol := 2
	for {
		args, err := readCommand(reader)
		if err != nil || len(args) == 0 {
			return
		}
		switch strings.ToUpper(args[0]) {
		case "HELLO":
			if len(args) > 1 {
				protocol, _ = strconv.Atoi(args[1])
			}
			f.negotiated.Store(int32(protocol))
			if protocol == 3 {
				fmt.Fprint(conn, "%1\r\n$6\r\nserver\r\n$5\r\nredis\r\n")
			} else {
				fmt.Fprint(conn, "*2\r\n$6\r\nserver\r\n$5\r\nredis\r\n")
			}
		case "HGETALL":
			if protocol == 3 {
				fmt.Fprint(conn, "%2\r\n$1\r\na\r\n$1\r\n1\r\n$1\r\nb\r\n$1\r\n2\r\n")
			} else {
				fmt.Fprint(conn, "*4\r\n$1\r\na\r\n$1\r\n1\r\n$1\r\nb\r\n$1\r\n2\r\n")
			}
		default:
			fmt.Fprint(conn, "+OK\r\n")
		}
	}
}

// go-redis v9 negotiates RESP3 by default, so HGETALL, CONFIG GET and XINFO
// replies surface as map[interface{}]interface{}. That type cannot be encoded
// as JSON, so Wails could not return the command result to the UI at all.
func TestRunCommandResultIsJSONSerializable(t *testing.T) {
	fake := startFakeRedis(t)
	host, portText, _ := net.SplitHostPort(fake.addr)
	port, _ := strconv.ParseInt(portText, 10, 64)
	a := New(Config{Host: host, Port: port})
	defer a.Close()

	ctx, cancel := context.WithTimeout(context.Background(), protocolTestTimeout)
	defer cancel()
	res, err := a.RunCommand(ctx, "HGETALL h")
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(res.Result)
	if err != nil {
		t.Fatalf("command result cannot be sent to the UI: %v (type %T)", err, res.Result)
	}
	var decoded []string
	if err := json.Unmarshal(encoded, &decoded); err != nil || !reflect.DeepEqual(decoded, []string{"a", "1", "b", "2"}) {
		t.Fatalf("HGETALL result = %s, want the flat field/value list", encoded)
	}
	if got := fake.negotiated.Load(); got != 2 {
		t.Fatalf("client negotiated RESP%d, want RESP2", got)
	}
}
