package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/acp"
	"github.com/asta-nguyen/kamehadb/internal/ai"
	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// A dedicated fake kind lets this regression test register an adapter factory
// and prove the AI chat flow never constructs or runs an adapter for
// provider-generated SQL. (Why)
const fakeChatKind = "faketest"

type fakeProfileLoader struct{ cp engines.ConnProfile }

func (f fakeProfileLoader) ProfileForConnect(string) (engines.ConnProfile, error) {
	return f.cp, nil
}

// SaveAISettings accepts an ACP preset without KamehaDB provider credentials,
// rejects an unknown preset id, and keeps provider validation for provider
// chat. (What / Why)
func TestSaveAISettingsChatAgent(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "kamehadb.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	svc := &AiService{st: st}
	settings, err := st.GetAISettings()
	if err != nil {
		t.Fatal(err)
	}

	agent := "codex"
	acpSettings := *settings
	acpSettings.ActiveChatAgent = &agent
	if err := svc.SaveAISettings(acpSettings); err != nil {
		t.Fatalf("ACP settings with no enabled provider should save: %v", err)
	}
	got, err := st.GetAISettings()
	if err != nil {
		t.Fatal(err)
	}
	if got.ActiveChatAgent == nil || *got.ActiveChatAgent != "codex" {
		t.Fatalf("agent not saved: %+v", got.ActiveChatAgent)
	}

	bad := "bogus-agent"
	badSettings := *settings
	badSettings.ActiveChatAgent = &bad
	if err := svc.SaveAISettings(badSettings); err == nil {
		t.Fatal("unknown preset id must be rejected")
	}

	// Provider chat still requires an enabled, valid provider.
	providerSettings := *settings
	providerSettings.ActiveChatAgent = nil
	if err := svc.SaveAISettings(providerSettings); err == nil {
		t.Fatal("provider chat with disabled active provider must be rejected")
	}
}

// Generated SQL from a provider is streamed to chat for review, never executed
// and never sent back with result rows. The old flow ran the query and made a
// second provider request, so one provider call plus a zero-call adapter
// factory is the regression signal. (What / Why)
func TestRunChatDoesNotExecuteGeneratedSQL(t *testing.T) {
	const generated = "Here is the query:\n```sql\nSELECT setval('users_id_seq', 1);\n```"

	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests++
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "data: {\"choices\":[{\"delta\":{\"content\":%q}}]}\n\n", generated)
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	factoryCalls := 0
	engines.RegisterFactory(fakeChatKind, func(engines.ConnProfile) (engines.SQLAdapter, error) {
		factoryCalls++
		return nil, fmt.Errorf("adapter must not be constructed from AI chat")
	})
	reg := engines.NewRegistry(fakeProfileLoader{cp: engines.ConnProfile{
		Kind: fakeChatKind, Host: "localhost", Port: 5432, Database: "d",
		Username: "u", Password: "p", HasPassword: true,
	}})

	st, err := store.Open(filepath.Join(t.TempDir(), "kamehadb.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	var events []chatEvent
	svc := &AiService{
		st: st, reg: reg, cache: newTTLCache(), chats: map[string]context.CancelFunc{},
		emit: func(_ string, data any) {
			if ev, ok := data.(chatEvent); ok {
				events = append(events, ev)
			}
		},
	}

	cfg := store.AIProviderConfig{Enabled: true, Model: "test", BaseURL: server.URL}
	svc.runChat(context.Background(), "req-1", ChatInput{ConnectionID: "c1"},
		[]ai.ChatMessage{{Role: "user", Content: "reset the sequence"}}, "ollama-local", cfg)

	if requests != 1 {
		t.Fatalf("provider called %d times, want 1 (no result-row follow-up)", requests)
	}
	if factoryCalls != 0 {
		t.Fatalf("adapter factory called %d times, want 0", factoryCalls)
	}

	var streamed strings.Builder
	done := false
	for _, ev := range events {
		switch ev.Type {
		case "content":
			streamed.WriteString(ev.Delta)
		case "done":
			done = true
		case "error":
			t.Fatalf("unexpected error event: %s", ev.Message)
		}
	}
	if streamed.String() != generated {
		t.Fatalf("streamed %q, want the provider response %q", streamed.String(), generated)
	}
	if !done {
		t.Fatal("stream never completed")
	}
}

// Reads and writes must derive cache keys through the same function, so a
// table-scoped entry is read back under its table key and a connection-level
// entry cannot shadow it. (Why)
func TestSchemaCacheKey(t *testing.T) {
	cases := []struct {
		name          string
		connectionID  string
		tableID       string
		mongoDatabase string
		want          string
	}{
		{"connection scope", "c1", "", "", "ai-schema:c1:sql"},
		{"table scope", "c1", "public.users", "", "ai-schema:c1:sql:public.users"},
		{"mongo scope", "c1", "", "appdb", "ai-schema:c1:mongo:appdb"},
		{"mongo wins over table", "c1", "public.users", "appdb", "ai-schema:c1:mongo:appdb"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := schemaCacheKey(tc.connectionID, tc.tableID, tc.mongoDatabase); got != tc.want {
				t.Fatalf("schemaCacheKey(%q, %q, %q) = %q, want %q",
					tc.connectionID, tc.tableID, tc.mongoDatabase, got, tc.want)
			}
		})
	}
}

// ACP test doubles: a scripted agent runtime and a token issuer, so the routing
// tests never launch a real CLI or bind the MCP listener. (Why)
type fakeACP struct {
	run               func(ctx context.Context, in acp.TurnInput) (acp.TurnResult, error)
	respondPermission func(id, optionID string) error
	closed            bool
}

func (f *fakeACP) RunTurn(ctx context.Context, in acp.TurnInput) (acp.TurnResult, error) {
	return f.run(ctx, in)
}

func (f *fakeACP) RespondPermission(id, optionID string) error {
	if f.respondPermission != nil {
		return f.respondPermission(id, optionID)
	}
	return nil
}

func (f *fakeACP) CloseAll() { f.closed = true }

type fakeMCP struct {
	eligible        bool
	endpoint, token string
	revoked         []string
}

func (f *fakeMCP) IssueSessionToken(string) (string, string, bool) {
	if !f.eligible {
		return "", "", false
	}
	return f.endpoint, f.token, true
}

func (f *fakeMCP) RevokeSessionToken(token string) { f.revoked = append(f.revoked, token) }

// eventSink collects chat events and closes done on a terminal event.
type eventSink struct {
	mu     sync.Mutex
	events []chatEvent
	done   chan struct{}
	once   sync.Once
}

func newEventSink() *eventSink { return &eventSink{done: make(chan struct{})} }

func (s *eventSink) emit(_ string, data any) {
	ev, ok := data.(chatEvent)
	if !ok {
		return
	}
	s.mu.Lock()
	s.events = append(s.events, ev)
	s.mu.Unlock()
	if ev.Type == "done" || ev.Type == "error" {
		s.once.Do(func() { close(s.done) })
	}
}

func (s *eventSink) snapshot() []chatEvent {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]chatEvent(nil), s.events...)
}

func newACPTestService(t *testing.T, st *store.Store, runner acpRunner, tuner mcpTuner, sink *eventSink) *AiService {
	t.Helper()
	return &AiService{
		st: st, cache: newTTLCache(), chats: map[string]context.CancelFunc{},
		acp: runner, mcp: tuner, emit: sink.emit,
	}
}

func acpSettings(t *testing.T, st *store.Store, agent string) {
	t.Helper()
	settings, err := st.GetAISettings()
	if err != nil {
		t.Fatal(err)
	}
	settings.ActiveChatAgent = &agent
	if err := st.SaveAISettings(*settings); err != nil {
		t.Fatal(err)
	}
}

// An ACP turn needs no KamehaDB provider, streams agent text, persists the
// answer as assistant history, and announces the schema-only fallback when the
// connection has not enabled MCP. (What / Why)
func TestStartChatACPTurn(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "kamehadb.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	acpSettings(t, st, "codex")

	var gotContext string
	runner := &fakeACP{run: func(_ context.Context, in acp.TurnInput) (acp.TurnResult, error) {
		gotContext = in.Context
		in.OnText("hello ")
		in.OnText("world")
		in.OnTool(acp.ToolActivity{ID: "t1", Title: "Query", Status: "completed"})
		return acp.TurnResult{StopReason: "end_turn"}, nil
	}}
	sink := newEventSink()
	tuner := &fakeMCP{eligible: false}
	svc := newACPTestService(t, st, runner, tuner, sink)

	id, err := svc.StartChat(ChatInput{
		ConnectionID: "c1",
		Messages:     []ai.ChatMessage{{Role: "user", Content: "hi"}},
	})
	if err != nil {
		t.Fatalf("ACP chat must start with no provider configured: %v", err)
	}
	select {
	case <-sink.done:
	case <-time.After(2 * time.Second):
		t.Fatal("turn never finished")
	}

	var streamed strings.Builder
	var sawTool, sawNotice bool
	for _, ev := range sink.snapshot() {
		switch ev.Type {
		case "content":
			streamed.WriteString(ev.Delta)
		case "tool":
			sawTool = ev.Title == "Query"
		case "notice":
			sawNotice = true
		}
	}
	if streamed.String() != "hello world" {
		t.Fatalf("streamed %q", streamed.String())
	}
	if !sawTool {
		t.Fatal("tool activity was not surfaced")
	}
	if !sawNotice {
		t.Fatal("schema-only notice was not emitted when MCP is not enabled")
	}

	msgs, err := st.GetChatMessages("c1", 10, nil)
	if err != nil {
		t.Fatal(err)
	}
	var assistant string
	for _, m := range msgs {
		if m.Role == "assistant" {
			assistant = m.Content
		}
	}
	if assistant != "hello world" {
		t.Fatalf("assistant history %q", assistant)
	}
	if strings.Contains(gotContext, "read-only access") {
		t.Fatal("context must not claim MCP access when the token is ineligible")
	}
	_ = id
}

// When the selected profile is MCP-eligible the turn carries the scoped endpoint
// and token to the agent, and the token is revoked at turn end. (Why)
func TestStartChatACPMCPToken(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "kamehadb.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	acpSettings(t, st, "claude")

	var seen acp.TurnInput
	runner := &fakeACP{run: func(_ context.Context, in acp.TurnInput) (acp.TurnResult, error) {
		seen = in
		return acp.TurnResult{StopReason: "end_turn"}, nil
	}}
	sink := newEventSink()
	tuner := &fakeMCP{eligible: true, endpoint: "http://127.0.0.1:9/mcp", token: "tok-1"}
	svc := newACPTestService(t, st, runner, tuner, sink)

	if _, err := svc.StartChat(ChatInput{ConnectionID: "c1", Messages: []ai.ChatMessage{{Role: "user", Content: "hi"}}}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-sink.done:
	case <-time.After(2 * time.Second):
		t.Fatal("turn never finished")
	}

	if seen.MCP == nil || seen.MCP.Endpoint != "http://127.0.0.1:9/mcp" || seen.MCP.Token != "tok-1" {
		t.Fatalf("MCP config not attached: %+v", seen.MCP)
	}
	if !strings.Contains(seen.Context, "read-only access") {
		t.Fatalf("context missing MCP access note: %q", seen.Context)
	}
	if len(tuner.revoked) != 1 || tuner.revoked[0] != "tok-1" {
		t.Fatalf("token not revoked: %v", tuner.revoked)
	}
	for _, ev := range sink.snapshot() {
		if ev.Type == "notice" {
			t.Fatalf("unexpected schema-only notice when MCP is eligible: %+v", ev)
		}
	}
}

// A permission prompt is surfaced with its correlation id and options, and the
// response is validated against the active chat and the runtime's options. (Why)
func TestStartChatACPPermission(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "kamehadb.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	acpSettings(t, st, "codex")

	requested := make(chan acp.PermissionRequest, 1)
	runner := &fakeACP{run: func(_ context.Context, in acp.TurnInput) (acp.TurnResult, error) {
		in.OnPermission(acp.PermissionRequest{
			ID: "perm-1", Title: "Run query",
			Options: []acp.PermissionOption{{ID: "allow", Name: "Allow"}, {ID: "deny", Name: "Deny"}},
		})
		requested <- acp.PermissionRequest{ID: "perm-1"}
		return acp.TurnResult{StopReason: "end_turn"}, nil
	}}
	sink := newEventSink()
	var delegated []string
	runner.respondPermission = func(id, optionID string) error {
		if id != "perm-1" || optionID != "allow" {
			return fmt.Errorf("bad delegation %s/%s", id, optionID)
		}
		delegated = append(delegated, id+":"+optionID)
		return nil
	}
	svc := newACPTestService(t, st, runner, &fakeMCP{}, sink)

	id, err := svc.StartChat(ChatInput{ConnectionID: "c1", Messages: []ai.ChatMessage{{Role: "user", Content: "hi"}}})
	if err != nil {
		t.Fatal(err)
	}

	// Unknown chat ids are rejected before reaching the runtime.
	if err := svc.RespondPermission("nope", "perm-1", "allow"); err == nil {
		t.Fatal("expected inactive chat error")
	}
	if err := svc.RespondPermission(id, "perm-1", "allow"); err != nil {
		t.Fatalf("valid response rejected: %v", err)
	}
	if len(delegated) != 1 {
		t.Fatalf("runtime not called: %v", delegated)
	}

	select {
	case <-sink.done:
	case <-time.After(2 * time.Second):
		t.Fatal("turn never finished")
	}
	var sawPermission bool
	for _, ev := range sink.snapshot() {
		if ev.Type == "permission" {
			sawPermission = ev.PermissionID == "perm-1" && len(ev.Options) == 2
		}
	}
	if !sawPermission {
		t.Fatal("permission event not emitted with options")
	}
}

// Cancelling an ACP chat aborts the turn and emits a terminal done event. (Why)
func TestCancelChatACP(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "kamehadb.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	acpSettings(t, st, "codex")

	started := make(chan struct{})
	runner := &fakeACP{run: func(ctx context.Context, _ acp.TurnInput) (acp.TurnResult, error) {
		close(started)
		<-ctx.Done()
		return acp.TurnResult{StopReason: "cancelled"}, ctx.Err()
	}}
	sink := newEventSink()
	svc := newACPTestService(t, st, runner, &fakeMCP{}, sink)

	id, err := svc.StartChat(ChatInput{Messages: []ai.ChatMessage{{Role: "user", Content: "hi"}}})
	if err != nil {
		t.Fatal(err)
	}
	<-started
	svc.CancelChat(id)

	select {
	case <-sink.done:
	case <-time.After(2 * time.Second):
		t.Fatal("cancelled turn never emitted done")
	}
	for _, ev := range sink.snapshot() {
		if ev.Type == "error" {
			t.Fatalf("cancellation must not surface as an error: %+v", ev)
		}
	}
}

// Shutdown closes the ACP runtime so no agent process outlives the app. (Why)
func TestAiServiceCloseACP(t *testing.T) {
	runner := &fakeACP{}
	svc := newACPTestService(t, nil, runner, nil, newEventSink())
	svc.Close()
	if !runner.closed {
		t.Fatal("Close must shut the ACP runtime down")
	}
}

// ACP mode must not contact KamehaDB's provider at all, even with one
// configured and a connection selected. (What / Why)
func TestStartChatACPNoProviderRequest(t *testing.T) {
	providerRequests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		providerRequests++
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	st, err := store.Open(filepath.Join(t.TempDir(), "kamehadb.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	settings, err := st.GetAISettings()
	if err != nil {
		t.Fatal(err)
	}
	agent := "codex"
	settings.ActiveChatAgent = &agent
	settings.ActiveProvider = "test-provider"
	settings.Providers = map[string]store.AIProviderConfig{
		"test-provider": {Enabled: true, Model: "test", BaseURL: server.URL},
	}
	if err := st.SaveAISettings(*settings); err != nil {
		t.Fatal(err)
	}

	runner := &fakeACP{run: func(context.Context, acp.TurnInput) (acp.TurnResult, error) {
		return acp.TurnResult{StopReason: "end_turn"}, nil
	}}
	sink := newEventSink()
	svc := newACPTestService(t, st, runner, &fakeMCP{}, sink)

	if _, err := svc.StartChat(ChatInput{Messages: []ai.ChatMessage{{Role: "user", Content: "hi"}}}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-sink.done:
	case <-time.After(2 * time.Second):
		t.Fatal("turn never finished")
	}
	if providerRequests != 0 {
		t.Fatalf("ACP chat hit the provider %d times", providerRequests)
	}
}
