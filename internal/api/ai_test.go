package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

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
