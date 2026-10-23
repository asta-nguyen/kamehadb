package duckdriver

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

const (
	maxDriverJobs        = 16
	sendQueueSize        = maxDriverJobs * 2
	initialMessageBuffer = 64 << 10
)

type outgoing struct {
	ctx     context.Context
	request Request
}

type reply struct {
	response Response
	err      error
}

// Client owns one child for one adapter. A broken child remains broken until
// an explicit reconnect: replaying a query after EOF could repeat a write.
type Client struct {
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	stderr   tailBuffer
	queue    chan outgoing
	done     chan struct{}
	waitDone chan struct{}
	stop     sync.Once
	mu       sync.Mutex
	pending  map[uint64]chan reply
	nextID   uint64
	err      error
}

type tailBuffer struct {
	sync.Mutex
	bytes []byte
}

// Keep only a bounded diagnostic tail; noisy native extensions must not turn
// stderr collection into an unbounded second dataset.
func (b *tailBuffer) Write(p []byte) (int, error) {
	b.Lock()
	defer b.Unlock()
	n := len(p)
	if len(p) >= MaxStderrBytes {
		b.bytes = append(b.bytes[:0], p[len(p)-MaxStderrBytes:]...)
	} else {
		if drop := len(b.bytes) + len(p) - MaxStderrBytes; drop > 0 {
			b.bytes = b.bytes[drop:]
		}
		b.bytes = append(b.bytes, p...)
	}
	return n, nil
}

func (b *tailBuffer) String() string {
	b.Lock()
	defer b.Unlock()
	return string(b.bytes)
}

func Start(ctx context.Context, path string, input OpenInput) (*Client, error) {
	return startCommand(ctx, exec.Command(path), input)
}

// Handshake precedes opening any database. Startup failure always reaps the
// child; matching a filename/checksum alone does not prove protocol compatibility.
func startCommand(ctx context.Context, cmd *exec.Cmd, input OpenInput) (*Client, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	c := &Client{
		cmd: cmd, queue: make(chan outgoing, sendQueueSize),
		done: make(chan struct{}), waitDone: make(chan struct{}), pending: make(map[uint64]chan reply),
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	// Own the output pipe ourselves: exec.Wait must not close it before the
	// reader has consumed a final response emitted immediately before exit.
	stdout, childOutput, err := os.Pipe()
	if err != nil {
		stdin.Close()
		return nil, err
	}
	c.stdin = stdin
	cmd.Stdout = childOutput
	cmd.Stderr = &c.stderr
	configureCommand(cmd)
	if err := cmd.Start(); err != nil {
		stdin.Close()
		stdout.Close()
		childOutput.Close()
		return nil, fmt.Errorf("DuckDB optional driver could not start: %w", err)
	}
	_ = childOutput.Close()
	go c.writeLoop()
	go func() { defer stdout.Close(); c.readLoop(stdout) }()
	go func() { _ = cmd.Wait(); close(c.waitDone) }()
	startup, cancel := context.WithTimeout(ctx, StartupTimeout)
	defer cancel()
	var hello Handshake
	if err = c.Call(startup, MethodHello, nil, &hello); err == nil && (hello.Protocol != ProtocolVersion || hello.Version != ReleaseVersion) {
		err = fmt.Errorf("DuckDB driver version/protocol mismatch: got %s/%d, need %s/%d", hello.Version, hello.Protocol, ReleaseVersion, ProtocolVersion)
	}
	if err == nil {
		err = c.Call(startup, MethodOpen, input, nil)
	}
	if err != nil {
		c.fail(err)
		_ = c.Close()
		return nil, err
	}
	return c, nil
}

// Requests and their cancellation notices share a FIFO writer. Cancellation
// cannot overtake registration, even when another request is writing a large SQL.
func (c *Client) writeLoop() {
	for {
		select {
		case <-c.done:
			return
		case entry := <-c.queue:
			if err := entry.ctx.Err(); err != nil && entry.request.Method != MethodCancel {
				c.deliver(entry.request.ID, reply{err: err})
				continue
			}
			data, err := json.Marshal(entry.request)
			if err == nil && len(data) > MaxMessageBytes {
				err = errors.New("DuckDB request exceeds the private protocol size limit")
			}
			if err != nil {
				c.deliver(entry.request.ID, reply{err: err})
				continue
			}
			data = append(data, '\n')
			if _, err := c.stdin.Write(data); err != nil {
				c.fail(fmt.Errorf("DuckDB driver pipe failed; SQL may already have executed: %w", err))
				return
			}
		}
	}
}

func (c *Client) readLoop(reader io.Reader) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, initialMessageBuffer), MaxMessageBytes+1)
	for scanner.Scan() {
		var response Response
		if err := Decode(scanner.Bytes(), &response); err != nil {
			c.fail(err)
			return
		}
		c.deliver(response.ID, reply{response: response})
	}
	err := scanner.Err()
	if err == nil {
		err = io.EOF
	}
	c.fail(fmt.Errorf("DuckDB driver response ended; SQL may already have executed: %w", err))
}

func (c *Client) deliver(id uint64, result reply) {
	c.mu.Lock()
	channel := c.pending[id]
	c.mu.Unlock()
	if channel != nil {
		select {
		case channel <- result:
		default:
		}
	}
}

func (c *Client) fail(err error) {
	c.stop.Do(func() {
		if diagnostic := c.stderr.String(); diagnostic != "" {
			err = fmt.Errorf("%w; driver stderr: %s", err, diagnostic)
		}
		c.mu.Lock()
		c.err = err
		for _, channel := range c.pending {
			select {
			case channel <- reply{err: err}:
			default:
			}
		}
		close(c.done)
		c.mu.Unlock()
		_ = c.stdin.Close()
		_ = c.cmd.Process.Kill()
	})
}

// Cancellation waits for native acknowledgement, keeping the connection
// reusable. An unresponsive driver is killed/reaped, never replayed or hidden.
func (c *Client) Call(ctx context.Context, method string, params, output any) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	data, err := json.Marshal(params)
	if err != nil {
		return err
	}
	if len(data) > MaxMessageBytes-initialMessageBuffer {
		return errors.New("DuckDB request exceeds the private protocol size limit")
	}
	channel := make(chan reply, 1)
	c.mu.Lock()
	if c.err != nil {
		err := c.err
		c.mu.Unlock()
		return err
	}
	if len(c.pending) >= maxDriverJobs {
		c.mu.Unlock()
		return errors.New("DuckDB driver is busy; no SQL was executed")
	}
	c.nextID++
	id := c.nextID
	c.pending[id] = channel
	c.mu.Unlock()
	defer func() { c.mu.Lock(); delete(c.pending, id); c.mu.Unlock() }()
	select {
	case c.queue <- outgoing{ctx: ctx, request: Request{ID: id, Method: method, Params: data}}:
	case <-ctx.Done():
		return ctx.Err()
	case <-c.done:
		return c.failure()
	}
	select {
	case result := <-channel:
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if result.err != nil {
			return result.err
		}
		if result.response.Error != "" {
			return errors.New(result.response.Error)
		}
		if output != nil {
			return Decode(result.response.Result, output)
		}
		return nil
	case <-ctx.Done():
		deadline := time.NewTimer(StopTimeout)
		defer deadline.Stop()
		select {
		case c.queue <- outgoing{ctx: context.Background(), request: Request{Method: MethodCancel, CancelID: id}}:
		case <-c.done:
			return ctx.Err()
		case <-deadline.C:
			c.fail(errors.New("DuckDB driver did not accept cancellation; SQL may have executed"))
			return ctx.Err()
		}
		select {
		case <-channel:
		case <-c.done:
		case <-deadline.C:
			c.fail(errors.New("DuckDB driver did not acknowledge cancellation; reconnect before more SQL"))
		}
		return ctx.Err()
	}
}

func (c *Client) failure() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.err
}

func (c *Client) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), StopTimeout)
	defer cancel()
	// Bound graceful close itself, not just the wait after its RPC. Call's
	// cancellation grace must not accidentally double the shutdown timeout.
	closed := make(chan error, 1)
	go func() { closed <- c.Call(ctx, MethodClose, nil, nil) }()
	var err error
	select {
	case err = <-closed:
	case <-ctx.Done():
		c.fail(errors.New("DuckDB driver forced closed"))
		err = ctx.Err()
	}
	_ = c.stdin.Close()
	select {
	case <-c.waitDone:
		return err
	case <-ctx.Done():
		c.fail(errors.New("DuckDB driver forced closed"))
		<-c.waitDone
		return ctx.Err()
	}
}
