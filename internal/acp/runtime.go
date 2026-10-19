package acp

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"

	acpsdk "github.com/coder/acp-go-sdk"
)

// Role tags a transcript message so the agent prompt reads in order.
type Role string

const (
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
)

// Message is one prior turn replayed to the agent; ACP sessions are created
// fresh each turn, so the whole visible transcript must be resent.
type Message struct {
	Role    Role
	Content string
}

// MCPConfig points the agent at the selected profile's read-only MCP endpoint
// with a per-turn scoped token.
type MCPConfig struct {
	Endpoint string
	Token    string
}

// ToolActivity is a normalized tool-call update surfaced to the chat UI.
type ToolActivity struct {
	ID     string
	Title  string
	Status string
}

// PermissionOption is one choice offered for a tool-call permission prompt.
type PermissionOption struct {
	ID   string
	Name string
	Kind string
}

// PermissionRequest is emitted when the agent needs user approval.
type PermissionRequest struct {
	ID      string
	Title   string
	Options []PermissionOption
}

// TurnInput is everything needed to run one chat turn through an ACP agent.
type TurnInput struct {
	Agent        AgentID
	Messages     []Message
	Context      string
	MCP          *MCPConfig
	OnText       func(delta string)
	OnTool       func(ToolActivity)
	OnPermission func(PermissionRequest)
	OnNotice     func(string)
}

// TurnResult reports why the agent stopped the turn.
type TurnResult struct {
	StopReason string
}

// acpConn is the subset of the SDK client connection the runtime drives; it is
// an interface so tests can substitute a scripted agent.
type acpConn interface {
	Initialize(ctx context.Context, params acpsdk.InitializeRequest) (acpsdk.InitializeResponse, error)
	NewSession(ctx context.Context, params acpsdk.NewSessionRequest) (acpsdk.NewSessionResponse, error)
	Prompt(ctx context.Context, params acpsdk.PromptRequest) (acpsdk.PromptResponse, error)
	Cancel(ctx context.Context, params acpsdk.CancelNotification) error
	Done() <-chan struct{}
}

// launched holds a running agent process and its connection.
type launched struct {
	conn   acpConn
	kill   func()
	stderr func() string
}

// launcher starts an agent process and returns its connection. It is a field on
// Runtime rather than a package function so tests can inject a fake agent.
type launcher func(ctx context.Context, preset Preset, client acpsdk.Client) (*launched, error)

type pendingPermission struct {
	allowed map[string]bool
	reply   chan string
}

// Runtime owns the set of in-flight ACP turns and routes permission decisions
// back to the waiting turn by correlation id.
type Runtime struct {
	mu       sync.Mutex
	launch   launcher
	cancels  map[uint64]context.CancelFunc
	nextTurn uint64
	pending  map[string]*pendingPermission
	nextPerm uint64
	closed   bool
}

// NewRuntime builds a runtime backed by real agent processes.
func NewRuntime() *Runtime {
	return &Runtime{
		launch:  launchProcess,
		cancels: map[uint64]context.CancelFunc{},
		pending: map[string]*pendingPermission{},
	}
}

// RunTurn launches the preset agent, initializes a session, streams the prompt,
// and blocks until the agent stops or ctx is cancelled.
func (r *Runtime) RunTurn(ctx context.Context, in TurnInput) (TurnResult, error) {
	preset, ok := Lookup(string(in.Agent))
	if !ok {
		return TurnResult{}, fmt.Errorf("unknown ACP agent %q", in.Agent)
	}

	// Each turn gets its own cancel so CloseAll can abort hung agents.
	turnCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	turnID, ok := r.register(cancel)
	if !ok {
		return TurnResult{}, errors.New("ACP runtime is shutting down")
	}
	defer r.unregister(turnID)

	// Temp working directory: the agent must not default to the app's cwd.
	workDir, err := os.MkdirTemp("", "kamehadb-acp-")
	if err != nil {
		return TurnResult{}, err
	}
	defer os.RemoveAll(workDir)

	client := &turnClient{rt: r, ctx: turnCtx, in: in}
	l, err := r.launch(turnCtx, preset, client)
	if err != nil {
		return TurnResult{}, err
	}
	defer l.kill()

	// If the caller cancels, ask the agent to cancel and then kill the process
	// tree so Prompt unblocks even when the agent ignores the notification.
	stopWatch := make(chan struct{})
	defer close(stopWatch)
	go func() {
		select {
		case <-turnCtx.Done():
			client.cancelAgent(l.conn)
			l.kill()
		case <-stopWatch:
		}
	}()

	initResp, err := l.conn.Initialize(turnCtx, acpsdk.InitializeRequest{
		ProtocolVersion:    acpsdk.ProtocolVersionNumber,
		ClientCapabilities: acpsdk.ClientCapabilities{},
	})
	if err != nil {
		return TurnResult{}, agentError(err, l, "initialize")
	}

	servers := mcpServers(in, initResp, l)
	sess, err := l.conn.NewSession(turnCtx, acpsdk.NewSessionRequest{
		Cwd:        workDir,
		McpServers: servers,
	})
	if err != nil {
		return TurnResult{}, agentError(err, l, "new session")
	}
	client.setSession(string(sess.SessionId))

	resp, err := l.conn.Prompt(turnCtx, acpsdk.PromptRequest{
		SessionId: sess.SessionId,
		Prompt:    []acpsdk.ContentBlock{acpsdk.TextBlock(buildPrompt(in))},
	})
	if err != nil {
		// A cancelled turn ends with a context error, which is expected.
		if turnCtx.Err() != nil {
			return TurnResult{StopReason: string(acpsdk.StopReasonCancelled)}, turnCtx.Err()
		}
		return TurnResult{}, agentError(err, l, "prompt")
	}
	return TurnResult{StopReason: string(resp.StopReason)}, nil
}

// RespondPermission resolves a pending prompt by correlation id. Replaying or
// answering an unknown id is an error so stale UI clicks cannot surprise the
// agent.
func (r *Runtime) RespondPermission(id, optionID string) error {
	r.mu.Lock()
	p, ok := r.pending[id]
	if !ok {
		r.mu.Unlock()
		return fmt.Errorf("permission request %q is no longer active", id)
	}
	if !p.allowed[optionID] {
		r.mu.Unlock()
		return fmt.Errorf("invalid permission option %q", optionID)
	}
	delete(r.pending, id)
	r.mu.Unlock()
	p.reply <- optionID
	return nil
}

// CloseAll cancels every in-flight turn and resolves pending prompts as
// cancelled. Used on app shutdown.
func (r *Runtime) CloseAll() {
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return
	}
	r.closed = true
	for _, cancel := range r.cancels {
		cancel()
	}
	pending := r.pending
	r.pending = map[string]*pendingPermission{}
	r.mu.Unlock()
	for _, p := range pending {
		select {
		case p.reply <- "":
		default:
		}
	}
}

func (r *Runtime) register(cancel context.CancelFunc) (uint64, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return 0, false
	}
	r.nextTurn++
	r.cancels[r.nextTurn] = cancel
	return r.nextTurn, true
}

func (r *Runtime) unregister(id uint64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.cancels, id)
}

func (r *Runtime) addPending(allowed map[string]bool) (string, chan string, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return "", nil, false
	}
	r.nextPerm++
	id := fmt.Sprintf("perm-%d", r.nextPerm)
	ch := make(chan string, 1)
	r.pending[id] = &pendingPermission{allowed: allowed, reply: ch}
	return id, ch, true
}

func (r *Runtime) dropPending(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.pending, id)
}

// turnClient implements the SDK's Client. File and terminal capabilities are
// deliberately unadvertised, so those requests are rejected.
type turnClient struct {
	rt  *Runtime
	ctx context.Context
	in  TurnInput

	mu      sync.Mutex
	session string
}

func (c *turnClient) setSession(id string) {
	c.mu.Lock()
	c.session = id
	c.mu.Unlock()
}

func (c *turnClient) currentSession() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.session
}

// cancelAgent asks the agent to cancel the active session; the call is
// best-effort and never blocks turn teardown.
func (c *turnClient) cancelAgent(conn acpConn) {
	sid := c.currentSession()
	if sid == "" {
		return
	}
	_ = conn.Cancel(context.Background(), acpsdk.CancelNotification{SessionId: acpsdk.SessionId(sid)})
}

func (c *turnClient) SessionUpdate(ctx context.Context, n acpsdk.SessionNotification) error {
	u := n.Update
	switch {
	case u.AgentMessageChunk != nil:
		if c.in.OnText != nil && u.AgentMessageChunk.Content.Text != nil {
			c.in.OnText(u.AgentMessageChunk.Content.Text.Text)
		}
	case u.ToolCall != nil:
		if c.in.OnTool != nil {
			c.in.OnTool(ToolActivity{
				ID:     string(u.ToolCall.ToolCallId),
				Title:  u.ToolCall.Title,
				Status: string(u.ToolCall.Status),
			})
		}
	case u.ToolCallUpdate != nil:
		if c.in.OnTool != nil {
			title := ""
			if u.ToolCallUpdate.Title != nil {
				title = *u.ToolCallUpdate.Title
			}
			status := ""
			if u.ToolCallUpdate.Status != nil {
				status = string(*u.ToolCallUpdate.Status)
			}
			c.in.OnTool(ToolActivity{
				ID:     string(u.ToolCallUpdate.ToolCallId),
				Title:  title,
				Status: status,
			})
		}
	}
	return nil
}

func (c *turnClient) RequestPermission(ctx context.Context, p acpsdk.RequestPermissionRequest) (acpsdk.RequestPermissionResponse, error) {
	allowed := map[string]bool{}
	options := make([]PermissionOption, 0, len(p.Options))
	for _, o := range p.Options {
		id := string(o.OptionId)
		allowed[id] = true
		options = append(options, PermissionOption{ID: id, Name: o.Name, Kind: string(o.Kind)})
	}
	title := ""
	if p.ToolCall.Title != nil {
		title = *p.ToolCall.Title
	}

	id, reply, ok := c.rt.addPending(allowed)
	if !ok {
		return cancelledResponse(), nil
	}
	if c.in.OnPermission != nil {
		c.in.OnPermission(PermissionRequest{ID: id, Title: title, Options: options})
	} else {
		c.rt.dropPending(id)
		return cancelledResponse(), nil
	}

	select {
	case optionID := <-reply:
		if optionID == "" {
			return cancelledResponse(), nil
		}
		return acpsdk.RequestPermissionResponse{
			Outcome: acpsdk.NewRequestPermissionOutcomeSelected(acpsdk.PermissionOptionId(optionID)),
		}, nil
	case <-c.ctx.Done():
		c.rt.dropPending(id)
		return cancelledResponse(), nil
	case <-ctx.Done():
		c.rt.dropPending(id)
		return cancelledResponse(), nil
	}
}

func cancelledResponse() acpsdk.RequestPermissionResponse {
	return acpsdk.RequestPermissionResponse{Outcome: acpsdk.NewRequestPermissionOutcomeCancelled()}
}

func (*turnClient) ReadTextFile(context.Context, acpsdk.ReadTextFileRequest) (acpsdk.ReadTextFileResponse, error) {
	return acpsdk.ReadTextFileResponse{}, errCapabilityDisabled("fs.readTextFile")
}

func (*turnClient) WriteTextFile(context.Context, acpsdk.WriteTextFileRequest) (acpsdk.WriteTextFileResponse, error) {
	return acpsdk.WriteTextFileResponse{}, errCapabilityDisabled("fs.writeTextFile")
}

func (*turnClient) CreateTerminal(context.Context, acpsdk.CreateTerminalRequest) (acpsdk.CreateTerminalResponse, error) {
	return acpsdk.CreateTerminalResponse{}, errCapabilityDisabled("terminal")
}

func (*turnClient) KillTerminal(context.Context, acpsdk.KillTerminalRequest) (acpsdk.KillTerminalResponse, error) {
	return acpsdk.KillTerminalResponse{}, errCapabilityDisabled("terminal")
}

func (*turnClient) TerminalOutput(context.Context, acpsdk.TerminalOutputRequest) (acpsdk.TerminalOutputResponse, error) {
	return acpsdk.TerminalOutputResponse{}, errCapabilityDisabled("terminal")
}

func (*turnClient) ReleaseTerminal(context.Context, acpsdk.ReleaseTerminalRequest) (acpsdk.ReleaseTerminalResponse, error) {
	return acpsdk.ReleaseTerminalResponse{}, errCapabilityDisabled("terminal")
}

func (*turnClient) WaitForTerminalExit(context.Context, acpsdk.WaitForTerminalExitRequest) (acpsdk.WaitForTerminalExitResponse, error) {
	return acpsdk.WaitForTerminalExitResponse{}, errCapabilityDisabled("terminal")
}

func errCapabilityDisabled(name string) error {
	return fmt.Errorf("ACP client capability %s is not available", name)
}

// mcpServers builds the HTTP MCP server entry when the profile is attached and
// the agent advertises HTTP support; otherwise it falls back to text context
// and tells the user why. (Why: transports differ per agent.)
func mcpServers(in TurnInput, initResp acpsdk.InitializeResponse, l *launched) []acpsdk.McpServer {
	if in.MCP == nil {
		return nil
	}
	if initResp.AgentCapabilities.McpCapabilities.Http {
		return []acpsdk.McpServer{{
			Http: &acpsdk.McpServerHttpInline{
				Name: "kamehadb",
				Type: "http",
				Url:  in.MCP.Endpoint,
				Headers: []acpsdk.HttpHeader{
					{Name: "Authorization", Value: "Bearer " + in.MCP.Token},
				},
			},
		}}
	}
	if in.OnNotice != nil {
		in.OnNotice("This agent does not support HTTP MCP servers; database access is unavailable for this turn.")
	}
	return nil
}

// buildPrompt flattens the transcript and schema context into a single text
// block, because a fresh ACP session has no memory of earlier turns.
func buildPrompt(in TurnInput) string {
	var b strings.Builder
	if in.Context != "" {
		b.WriteString("Available database context:\n")
		b.WriteString(in.Context)
		b.WriteString("\n\n")
	}
	b.WriteString("Conversation so far:\n")
	for _, m := range in.Messages {
		role := "User"
		if m.Role == RoleAssistant {
			role = "Assistant"
		}
		b.WriteString(role)
		b.WriteString(": ")
		b.WriteString(m.Content)
		b.WriteString("\n")
	}
	return b.String()
}

// agentError folds a bounded slice of agent stderr into the wrapped error so a
// failed launch or protocol error is diagnosable from the chat panel.
func agentError(err error, l *launched, phase string) error {
	msg := strings.TrimSpace(l.stderr())
	if len(msg) > 500 {
		msg = msg[:500]
	}
	if msg != "" {
		return fmt.Errorf("acp %s failed: %w: %s", phase, err, msg)
	}
	return fmt.Errorf("acp %s failed: %w", phase, err)
}

// launchProcess starts the preset executable, wired to a raw SDK connection.
func launchProcess(_ context.Context, preset Preset, client acpsdk.Client) (*launched, error) {
	cmd := exec.Command(resolveExecutable(preset.Executable), preset.Args...)
	cmd.Env = sanitizedEnv()
	configureProcess(cmd)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start %s: %w", preset.Executable, err)
	}

	var once sync.Once
	kill := func() {
		once.Do(func() {
			if cmd.Process != nil {
				terminateProcess(cmd)
				_ = cmd.Wait()
			}
		})
	}
	return &launched{
		conn:   acpsdk.NewClientSideConnection(client, stdin, stdout),
		kill:   kill,
		stderr: func() string { return stderr.String() },
	}, nil
}

// sanitizedEnv strips KamehaDB's own env vars before spawning an agent, so a
// third-party process cannot read app internals. (Defensive; harmless now.)
func sanitizedEnv() []string {
	env := os.Environ()
	out := make([]string, 0, len(env))
	for _, kv := range env {
		if strings.HasPrefix(kv, "KAMEHADB_") {
			continue
		}
		out = append(out, kv)
	}
	return out
}
