package acp

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	acpsdk "github.com/coder/acp-go-sdk"
)

// fakeConn is a scripted ACP agent used to drive RunTurn without a real
// subprocess.
type fakeConn struct {
	client acpsdk.Client

	httpMCP   bool
	lastNew   acpsdk.NewSessionRequest
	lastPrmt  acpsdk.PromptRequest
	onPrompt  func(ctx context.Context, p acpsdk.PromptRequest) (acpsdk.PromptResponse, error)
	cancelCh  chan acpsdk.CancelNotification
	initError error
}

func (f *fakeConn) Initialize(context.Context, acpsdk.InitializeRequest) (acpsdk.InitializeResponse, error) {
	if f.initError != nil {
		return acpsdk.InitializeResponse{}, f.initError
	}
	return acpsdk.InitializeResponse{
		ProtocolVersion: acpsdk.ProtocolVersionNumber,
		AgentCapabilities: acpsdk.AgentCapabilities{
			McpCapabilities: acpsdk.McpCapabilities{Http: f.httpMCP},
		},
	}, nil
}

func (f *fakeConn) NewSession(_ context.Context, p acpsdk.NewSessionRequest) (acpsdk.NewSessionResponse, error) {
	f.lastNew = p
	return acpsdk.NewSessionResponse{SessionId: "session-1"}, nil
}

func (f *fakeConn) Prompt(ctx context.Context, p acpsdk.PromptRequest) (acpsdk.PromptResponse, error) {
	f.lastPrmt = p
	if f.onPrompt != nil {
		return f.onPrompt(ctx, p)
	}
	return acpsdk.PromptResponse{StopReason: acpsdk.StopReasonEndTurn}, nil
}

func (f *fakeConn) Cancel(_ context.Context, n acpsdk.CancelNotification) error {
	if f.cancelCh != nil {
		select {
		case f.cancelCh <- n:
		default:
		}
	}
	return nil
}

func (f *fakeConn) Done() <-chan struct{} { return nil }

// fakeLauncher returns a launcher that yields fc and records the kill.
func fakeLauncher(fc *fakeConn, killed *bool) launcher {
	return func(_ context.Context, _ Preset, client acpsdk.Client) (*launched, error) {
		fc.client = client
		return &launched{
			conn:   fc,
			kill:   func() { *killed = true },
			stderr: func() string { return "" },
		}, nil
	}
}

func ptr[T any](v T) *T { return &v }

func TestRunTurnStreamsTextAndTools(t *testing.T) {
	fc := &fakeConn{}
	fc.onPrompt = func(ctx context.Context, _ acpsdk.PromptRequest) (acpsdk.PromptResponse, error) {
		_ = fc.client.SessionUpdate(ctx, acpsdk.SessionNotification{
			SessionId: "session-1",
			Update: acpsdk.SessionUpdate{
				AgentMessageChunk: &acpsdk.SessionUpdateAgentMessageChunk{Content: acpsdk.TextBlock("hello ")},
			},
		})
		_ = fc.client.SessionUpdate(ctx, acpsdk.SessionNotification{
			SessionId: "session-1",
			Update: acpsdk.SessionUpdate{
				ToolCall: &acpsdk.SessionUpdateToolCall{
					ToolCallId: "t1", Title: "Query", Status: acpsdk.ToolCallStatusInProgress,
				},
			},
		})
		return acpsdk.PromptResponse{StopReason: acpsdk.StopReasonEndTurn}, nil
	}

	rt := NewRuntime()
	killed := false
	rt.launch = fakeLauncher(fc, &killed)

	var text strings.Builder
	var tools []ToolActivity
	res, err := rt.RunTurn(context.Background(), TurnInput{
		Agent:    AgentCodex,
		Messages: []Message{{Role: RoleUser, Content: "hi"}},
		Context:  "schema",
		OnText:   func(d string) { text.WriteString(d) },
		OnTool:   func(a ToolActivity) { tools = append(tools, a) },
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.StopReason != string(acpsdk.StopReasonEndTurn) {
		t.Fatalf("stop reason %q", res.StopReason)
	}
	if text.String() != "hello " {
		t.Fatalf("text %q", text.String())
	}
	if len(tools) != 1 || tools[0].Title != "Query" || tools[0].Status != "in_progress" {
		t.Fatalf("tools %+v", tools)
	}
	if !killed {
		t.Fatal("agent process was not killed")
	}
	if !strings.Contains(buildPrompt(TurnInput{Context: "ctx", Messages: []Message{{Role: RoleUser, Content: "q"}}}), "q") {
		t.Fatal("prompt missing transcript")
	}
}

func TestRunTurnMCPAttachment(t *testing.T) {
	// With HTTP MCP support the scoped endpoint + token reach the session.
	fc := &fakeConn{httpMCP: true}
	rt := NewRuntime()
	killed := false
	rt.launch = fakeLauncher(fc, &killed)

	_, err := rt.RunTurn(context.Background(), TurnInput{
		Agent: AgentClaude,
		MCP:   &MCPConfig{Endpoint: "http://127.0.0.1:9999/mcp", Token: "turn-token"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(fc.lastNew.McpServers) != 1 || fc.lastNew.McpServers[0].Http == nil {
		t.Fatalf("expected one HTTP MCP server, got %+v", fc.lastNew.McpServers)
	}
	srv := fc.lastNew.McpServers[0].Http
	if srv.Url != "http://127.0.0.1:9999/mcp" {
		t.Fatalf("endpoint %q", srv.Url)
	}
	if len(srv.Headers) != 1 || srv.Headers[0].Value != "Bearer turn-token" {
		t.Fatalf("headers %+v", srv.Headers)
	}

	// Without HTTP support the runtime falls back to text and notices the user.
	fc2 := &fakeConn{httpMCP: false}
	rt2 := NewRuntime()
	killed2 := false
	rt2.launch = fakeLauncher(fc2, &killed2)
	var notice string
	if _, err := rt2.RunTurn(context.Background(), TurnInput{
		Agent:    AgentClaude,
		MCP:      &MCPConfig{Endpoint: "http://x/mcp", Token: "t"},
		OnNotice: func(s string) { notice = s },
	}); err != nil {
		t.Fatal(err)
	}
	if len(fc2.lastNew.McpServers) != 0 {
		t.Fatalf("expected no MCP servers, got %+v", fc2.lastNew.McpServers)
	}
	if notice == "" {
		t.Fatal("expected a fallback notice")
	}
}

func TestRequestPermissionRoundTrip(t *testing.T) {
	fc := &fakeConn{}
	var allowed acpsdk.PermissionOptionId
	fc.onPrompt = func(ctx context.Context, _ acpsdk.PromptRequest) (acpsdk.PromptResponse, error) {
		resp, err := fc.client.RequestPermission(ctx, acpsdk.RequestPermissionRequest{
			SessionId: "session-1",
			ToolCall:  acpsdk.ToolCallUpdate{ToolCallId: "t1", Title: ptr("Run query")},
			Options: []acpsdk.PermissionOption{
				{OptionId: "allow", Name: "Allow", Kind: acpsdk.PermissionOptionKindAllowOnce},
				{OptionId: "reject", Name: "Reject", Kind: acpsdk.PermissionOptionKindRejectOnce},
			},
		})
		if err != nil {
			return acpsdk.PromptResponse{}, err
		}
		if resp.Outcome.Selected != nil {
			allowed = resp.Outcome.Selected.OptionId
		}
		return acpsdk.PromptResponse{StopReason: acpsdk.StopReasonEndTurn}, nil
	}

	rt := NewRuntime()
	killed := false
	rt.launch = fakeLauncher(fc, &killed)

	got := make(chan PermissionRequest, 1)
	done := make(chan error, 1)
	go func() {
		_, err := rt.RunTurn(context.Background(), TurnInput{
			Agent:        AgentCodex,
			OnPermission: func(p PermissionRequest) { got <- p },
		})
		done <- err
	}()

	req := <-got
	if req.Title != "Run query" || len(req.Options) != 2 {
		t.Fatalf("permission %+v", req)
	}

	// Unknown and invalid options are rejected without resolving the prompt.
	if err := rt.RespondPermission("bogus", "allow"); err == nil {
		t.Fatal("expected stale id error")
	}
	if err := rt.RespondPermission(req.ID, "nope"); err == nil {
		t.Fatal("expected invalid option error")
	}
	if err := rt.RespondPermission(req.ID, "allow"); err != nil {
		t.Fatal(err)
	}
	// Replay is rejected.
	if err := rt.RespondPermission(req.ID, "allow"); err == nil {
		t.Fatal("expected replay error")
	}

	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if allowed != "allow" {
		t.Fatalf("agent saw option %q", allowed)
	}
}

func TestCancellationKillsProcess(t *testing.T) {
	fc := &fakeConn{cancelCh: make(chan acpsdk.CancelNotification, 1)}
	fc.onPrompt = func(ctx context.Context, _ acpsdk.PromptRequest) (acpsdk.PromptResponse, error) {
		<-ctx.Done()
		return acpsdk.PromptResponse{}, ctx.Err()
	}

	rt := NewRuntime()
	var mu sync.Mutex
	killed := false
	rt.launch = fakeLauncher(fc, &killed)

	ctx, cancel := context.WithCancel(context.Background())
	errc := make(chan error, 1)
	go func() {
		_, err := rt.RunTurn(ctx, TurnInput{Agent: AgentCodex})
		errc <- err
	}()

	time.Sleep(50 * time.Millisecond)
	cancel()

	if err := <-errc; !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}
	mu.Lock()
	k := killed
	mu.Unlock()
	if !k {
		t.Fatal("process was not killed on cancel")
	}
	select {
	case n := <-fc.cancelCh:
		if n.SessionId != "session-1" {
			t.Fatalf("cancel session %q", n.SessionId)
		}
	case <-time.After(time.Second):
		t.Fatal("agent was not notified to cancel")
	}
}

func TestCloseAllRejectsNewTurns(t *testing.T) {
	rt := NewRuntime()
	killed := false
	rt.launch = fakeLauncher(&fakeConn{}, &killed)
	rt.CloseAll()
	if _, err := rt.RunTurn(context.Background(), TurnInput{Agent: AgentCodex}); err == nil {
		t.Fatal("expected shutdown error")
	}
}

func TestRunTurnUnknownAgent(t *testing.T) {
	rt := NewRuntime()
	if _, err := rt.RunTurn(context.Background(), TurnInput{Agent: "nope"}); err == nil {
		t.Fatal("expected unknown agent error")
	}
}
