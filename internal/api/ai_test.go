package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/internal/ai"
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
	reg := testDB(t, fakeProfileLoader{cp: engines.ConnProfile{
		Kind: fakeChatKind, Host: "localhost", Port: 5432, Database: "d",
		Username: "u", Password: "p", HasPassword: true,
	}})
	testRegister(t, reg, fakeChatKind, func(engines.ConnProfile) (engines.SQLAdapter, error) {
		factoryCalls++
		return nil, fmt.Errorf("adapter must not be constructed from AI chat")
	})

	st, err := store.Open(filepath.Join(t.TempDir(), "kamehadb.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	var events []chatEvent
	svc := &AiService{
		st: st, lookup: reg, cache: newTTLCache(), chats: map[string]context.CancelFunc{},
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

// chatSchemaAdapter exposes one public.users table; failFirstScan makes the
// first ListSchemas call error so tests can exercise the indexing-failure
// fallback without breaking the full-schema path that reads the same table. (Why)
type chatSchemaAdapter struct {
	engines.UnsupportedAdapter
	mu            sync.Mutex
	scans         int
	failFirstScan bool
}

func (a *chatSchemaAdapter) ListSchemas(_ context.Context, _ *string) ([]engines.SchemaInfo, error) {
	a.mu.Lock()
	a.scans++
	fail := a.failFirstScan && a.scans == 1
	a.mu.Unlock()
	if fail {
		return nil, errors.New("index scan failed")
	}
	return []engines.SchemaInfo{{Name: "public"}}, nil
}

func (a *chatSchemaAdapter) ListTables(_ context.Context, _ *string) ([]engines.TableInfo, error) {
	return []engines.TableInfo{{ID: "public.users", Schema: "public", Name: "users", Type: "table"}}, nil
}

func (a *chatSchemaAdapter) GetTableColumns(_ context.Context, _ string) ([]engines.ColumnInfo, error) {
	return []engines.ColumnInfo{{Name: "id", Type: "integer", PrimaryKey: true}}, nil
}

// chatIndexingFixture wires a real store, the adapter facade, and an SSE
// provider stub. The stub records the messages of every /chat/completions
// request so tests can inspect the system prompt the schema context ended up
// in; other endpoints 404 so CreateEmbedding falls back to the local
// implementation. (What / Why)
type chatIndexingFixture struct {
	st      *store.Store
	svc     *AiService
	prompts chan []ai.ChatMessage
	events  chan chatEvent
	connID  string
}

func newChatIndexingFixture(t *testing.T, adapter engines.SQLAdapter) *chatIndexingFixture {
	t.Helper()

	prompts := make(chan []ai.ChatMessage, 4)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/chat/completions") {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		var req struct {
			Messages []ai.ChatMessage `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		prompts <- req.Messages
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "data: {\"choices\":[{\"delta\":{\"content\":%q}}]}\n\n", "ok")
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	t.Cleanup(server.Close)

	reg := testDB(t, fakeProfileLoader{cp: engines.ConnProfile{
		Kind: fakeChatKind, Host: "localhost", Port: 5432, Database: "d",
		Username: "u", Password: "p", HasPassword: true,
	}})
	testRegister(t, reg, fakeChatKind, func(engines.ConnProfile) (engines.SQLAdapter, error) {
		return adapter, nil
	})

	st, err := store.Open(filepath.Join(t.TempDir(), "kamehadb.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })

	// Saving settings also clears the process-wide aiSettingsCache, so a
	// previous test's provider config cannot leak into this fixture. (Why)
	if err := st.SaveAISettings(store.AISettings{
		ActiveProvider: "ollama-local",
		Providers: map[string]store.AIProviderConfig{
			"ollama-local": {Enabled: true, Model: "test", BaseURL: server.URL},
		},
	}); err != nil {
		t.Fatal(err)
	}

	// The stored profile needs a real SQL kind for the CHECK constraint; the
	// adapter factory is dispatched on the loader's fake kind instead. (Why)
	name, kind := "chat-test", engines.KindSQLite
	profile, err := st.CreateProfile(store.ProfileInput{Name: &name, Kind: &kind})
	if err != nil {
		t.Fatal(err)
	}

	events := make(chan chatEvent, 8)
	svc := &AiService{
		st: st, lookup: reg, cache: newTTLCache(), chats: map[string]context.CancelFunc{},
		emit: func(_ string, data any) {
			if ev, ok := data.(chatEvent); ok {
				events <- ev
			}
		},
	}
	return &chatIndexingFixture{st: st, svc: svc, prompts: prompts, events: events, connID: profile.ID}
}

// systemPrompt runs StartChat to completion and returns the system message the
// provider actually received — the observable proof of which schema-context
// path built it (relevance-search hits carry "Purpose:" lines; the full-schema
// fallback does not). (What / Why)
func (f *chatIndexingFixture) systemPrompt(t *testing.T, input ChatInput) string {
	t.Helper()
	if _, err := f.svc.StartChat(input); err != nil {
		t.Fatal(err)
	}
	var messages []ai.ChatMessage
	deadline := time.After(10 * time.Second)
	for messages == nil {
		select {
		case messages = <-f.prompts:
		case <-deadline:
			t.Fatal("provider never received the chat request")
		}
	}
	for done := false; !done; {
		select {
		case ev := <-f.events:
			if ev.Type == "error" {
				t.Fatalf("chat stream errored: %s", ev.Message)
			}
			done = ev.Type == "done"
		case <-deadline:
			t.Fatal("chat stream never finished")
		}
	}
	return messages[0].Content
}

func (f *chatIndexingFixture) embeddingRefs(t *testing.T) int {
	t.Helper()
	refs, err := f.st.ListEmbeddingRefs(f.connID)
	if err != nil {
		t.Fatal(err)
	}
	return len(refs)
}

func TestStartChatOnDemandIndexing(t *testing.T) {
	chatInput := func(tableID string) ChatInput {
		return ChatInput{
			Messages: []ai.ChatMessage{{Role: "user", Content: "show all users"}},
			TableID:  tableID,
		}
	}

	t.Run("general chat indexes before relevance search", func(t *testing.T) {
		fx := newChatIndexingFixture(t, &chatSchemaAdapter{})
		input := chatInput("")
		input.ConnectionID = fx.connID

		prompt := fx.systemPrompt(t, input)
		if fx.embeddingRefs(t) != 1 {
			t.Fatalf("%d embedding refs stored, want 1 (indexing ran)", fx.embeddingRefs(t))
		}
		if !strings.Contains(prompt, "Purpose:") {
			t.Fatal("system prompt lacks the enriched embedding text — relevance search found no fresh index")
		}
	})

	t.Run("table-scoped chat skips connection indexing", func(t *testing.T) {
		fx := newChatIndexingFixture(t, &chatSchemaAdapter{})
		input := chatInput("public.users")
		input.ConnectionID = fx.connID

		prompt := fx.systemPrompt(t, input)
		if fx.embeddingRefs(t) != 0 {
			t.Fatalf("%d embedding refs stored, want 0 (table chat must not index)", fx.embeddingRefs(t))
		}
		if !strings.Contains(prompt, "CREATE TABLE public.users") {
			t.Fatal("system prompt lacks the table-scoped DDL")
		}
		if strings.Contains(prompt, "Purpose:") {
			t.Fatal("system prompt contains enriched text — relevance search ran for a table-scoped chat")
		}
	})

	t.Run("indexing failure falls back to full schema", func(t *testing.T) {
		fx := newChatIndexingFixture(t, &chatSchemaAdapter{failFirstScan: true})
		input := chatInput("")
		input.ConnectionID = fx.connID

		prompt := fx.systemPrompt(t, input)
		if fx.embeddingRefs(t) != 0 {
			t.Fatalf("%d embedding refs stored, want 0 after a failed index", fx.embeddingRefs(t))
		}
		if !strings.Contains(prompt, "CREATE TABLE public.users") {
			t.Fatal("system prompt lacks the full-schema fallback DDL")
		}
		if strings.Contains(prompt, "Purpose:") {
			t.Fatal("system prompt contains enriched text — failed indexing should not produce search hits")
		}
	})
}
