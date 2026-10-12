package mcp

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	_ "github.com/asta-nguyen/kamehadb/internal/engines/sqlite"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

func openTestStore(t *testing.T) *store.Store {
	t.Helper()
	st, err := store.Open(t.TempDir() + "/meta.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	return st
}

func newTestRuntime(t *testing.T) (*Runtime, *store.Store) {
	t.Helper()
	st := openTestStore(t)
	r, err := NewRuntime(st)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(r.Close)
	return r, st
}

// createSQLiteProfile registers a file-db profile eligible for MCP without a
// managed account.
func createSQLiteProfile(t *testing.T, st *store.Store, filePath string, enabled bool) *store.Profile {
	t.Helper()
	name := "test-sqlite"
	kind := engines.KindSQLite
	p, err := st.CreateProfile(store.ProfileInput{
		Name: &name, Kind: &kind, FilePath: &filePath,
	})
	if err != nil {
		t.Fatal(err)
	}
	if enabled {
		if _, err := st.SetProfileMCPEnabled(p.ID, true); err != nil {
			t.Fatal(err)
		}
	}
	return p
}

func sqliteDBFile(t *testing.T) string {
	t.Helper()
	path := t.TempDir() + "/data.db"
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)"); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestRuntimeAuth(t *testing.T) {
	r, _ := newTestRuntime(t)
	r.bind(0)
	if r.GetStatus().Status != "listening" {
		t.Fatalf("expected listening, got %s (%s)", r.GetStatus().Status, r.GetStatus().Message)
	}
	base := fmt.Sprintf("http://127.0.0.1:%d/mcp", r.GetStatus().Port)
	token := r.Token()

	// No auth → 401
	resp, err := http.Post(base, "application/json", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"ping"}`))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 401 {
		t.Fatalf("want 401, got %d", resp.StatusCode)
	}

	// Bad token → 401
	req, _ := http.NewRequest("POST", base, strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"ping"}`))
	req.Header.Set("Authorization", "Bearer wrong-"+token)
	if resp, err := http.DefaultClient.Do(req); err != nil {
		t.Fatal(err)
	} else {
		resp.Body.Close()
		if resp.StatusCode != 401 {
			t.Fatalf("want 401 for bad token, got %d", resp.StatusCode)
		}
	}

	// Wrong path → 404
	req, _ = http.NewRequest("POST", "http://127.0.0.1:"+fmt.Sprint(r.GetStatus().Port)+"/nope", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer "+token)
	if resp, err := http.DefaultClient.Do(req); err != nil {
		t.Fatal(err)
	} else {
		resp.Body.Close()
		if resp.StatusCode != 404 {
			t.Fatalf("want 404, got %d", resp.StatusCode)
		}
	}

	// GET → 405
	req, _ = http.NewRequest("GET", base, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	if resp, err := http.DefaultClient.Do(req); err != nil {
		t.Fatal(err)
	} else {
		resp.Body.Close()
		if resp.StatusCode != 405 {
			t.Fatalf("want 405, got %d", resp.StatusCode)
		}
	}
}

func rpcCall(t *testing.T, r *Runtime, payload string) map[string]any {
	t.Helper()
	base := fmt.Sprintf("http://127.0.0.1:%d/mcp", r.GetStatus().Port)
	req, _ := http.NewRequest("POST", base, strings.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+r.Token())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var out map[string]any
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("bad json: %s", body)
	}
	return out
}

func TestInitializeAndToolsList(t *testing.T) {
	r, _ := newTestRuntime(t)
	r.bind(0)

	resp := rpcCall(t, r, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}`)
	result := resp["result"].(map[string]any)
	if result["protocolVersion"] != "2025-03-26" {
		t.Fatalf("protocol mismatch: %v", result)
	}
	info := result["serverInfo"].(map[string]any)
	if info["name"] != "kamehadb-mcp" {
		t.Fatalf("bad serverInfo: %v", info)
	}

	resp = rpcCall(t, r, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`)
	tools := resp["result"].(map[string]any)["tools"].([]any)
	if len(tools) != 10 {
		t.Fatalf("want 10 tools, got %d", len(tools))
	}
	names := map[string]bool{}
	for _, tool := range tools {
		names[tool.(map[string]any)["name"].(string)] = true
	}
	for _, want := range []string{"list_mcp_profiles", "sql_query", "mongo_find", "mongo_aggregate", "sql_describe_table"} {
		if !names[want] {
			t.Fatalf("missing tool %s", want)
		}
	}

	// Notification-only → 202 empty
	base := fmt.Sprintf("http://127.0.0.1:%d/mcp", r.GetStatus().Port)
	req, _ := http.NewRequest("POST", base, strings.NewReader(`{"jsonrpc":"2.0","method":"notifications/initialized"}`))
	req.Header.Set("Authorization", "Bearer "+r.Token())
	if resp, err := http.DefaultClient.Do(req); err != nil {
		t.Fatal(err)
	} else {
		resp.Body.Close()
		if resp.StatusCode != 202 {
			t.Fatalf("want 202 for notification, got %d", resp.StatusCode)
		}
	}
}

func TestToolCallsOverHTTP(t *testing.T) {
	r, st := newTestRuntime(t)
	dbPath := sqliteDBFile(t)
	p := createSQLiteProfile(t, st, dbPath, true)
	r.bind(0)

	// list_mcp_profiles sees the enabled profile
	resp := rpcCall(t, r, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_mcp_profiles","arguments":{}}}`)
	content := resp["result"].(map[string]any)["content"].([]any)
	text := content[0].(map[string]any)["text"].(string)
	if !strings.Contains(text, p.ID) {
		t.Fatalf("profile missing from list: %s", text)
	}

	// sql_query bounded read through the real sqlite file
	call := fmt.Sprintf(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"sql_query","arguments":{"connection_id":%q,"sql":"SELECT 1 AS one UNION ALL SELECT 2","max_rows":1}}}`, p.ID)
	resp = rpcCall(t, r, call)
	result := resp["result"].(map[string]any)
	text = result["content"].([]any)[0].(map[string]any)["text"].(string)
	var payload map[string]any
	if err := json.Unmarshal([]byte(text), &payload); err != nil {
		t.Fatalf("tool payload not json: %s", text)
	}
	if payload["truncated"] != true {
		t.Fatalf("want truncated=true for max_rows=1 on 2-row result: %s", text)
	}
	if rows := payload["rows"].([]any); len(rows) != 1 {
		t.Fatalf("want 1 row, got %v", rows)
	}

	// write statement → READ_ONLY_QUERY_REQUIRED
	call = fmt.Sprintf(`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"sql_query","arguments":{"connection_id":%q,"sql":"DROP TABLE x"}}}`, p.ID)
	resp = rpcCall(t, r, call)
	result = resp["result"].(map[string]any)
	if result["isError"] != true {
		t.Fatal("want isError for DROP")
	}
	text = result["content"].([]any)[0].(map[string]any)["text"].(string)
	if !strings.HasPrefix(text, "READ_ONLY_QUERY_REQUIRED:") {
		t.Fatalf("bad error code: %s", text)
	}

	// unknown connection → PROFILE_NOT_FOUND
	call = fmt.Sprintf(`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"sql_list_databases","arguments":{"connection_id":"nope"}}}`)
	resp = rpcCall(t, r, call)
	result = resp["result"].(map[string]any)
	text = result["content"].([]any)[0].(map[string]any)["text"].(string)
	if !strings.HasPrefix(text, "PROFILE_NOT_FOUND:") {
		t.Fatalf("bad error: %s", text)
	}

	// unknown tool → JSON-RPC error
	resp = rpcCall(t, r, `{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"nope","arguments":{}}}`)
	if resp["error"] == nil {
		t.Fatal("want rpc error for unknown tool")
	}
}

func TestManagerGuards(t *testing.T) {
	st := openTestStore(t)
	m := NewAdapterManager(st)
	ctx := context.Background()

	// Disabled profile → PROFILE_NOT_ENABLED
	p := createSQLiteProfile(t, st, sqliteDBFile(t), false)
	_, err := m.WithConnection(ctx, p.ID, func(c *Connection) (any, error) { return nil, nil })
	var toolErr *ToolError
	if !errors.As(err, &toolErr) || toolErr.Code != ErrProfileNotEnabled {
		t.Fatalf("want PROFILE_NOT_ENABLED, got %v", err)
	}

	// Enabled sqlite → canServe, entries created
	p2 := createSQLiteProfile(t, st, sqliteDBFile(t), true)
	got, err := m.WithConnection(ctx, p2.ID, func(c *Connection) (any, error) {
		if c.Kind != "sql" {
			t.Fatalf("want sql conn, got %s", c.Kind)
		}
		dbs, err := c.SQL.ListDatabases(ctx)
		if err != nil {
			return nil, err
		}
		return dbs, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if dbs := got.([]engines.DatabaseInfo); len(dbs) != 1 || dbs[0].Name != "main" {
		t.Fatalf("bad databases: %v", dbs)
	}

	// sqlite scope guard: database != main rejected
	other := "other"
	if err := assertSqliteTarget(&other, nil); err == nil {
		t.Fatal("sqlite scope should reject non-main database")
	}

	// BUSY cap
	p4 := createSQLiteProfile(t, st, sqliteDBFile(t), true)
	m.mu.Lock()
	e := m.entryFor(p4)
	e.inflight = MaxConcurrentCallsPerProfile
	m.mu.Unlock()
	_, err = m.WithConnection(ctx, p4.ID, func(c *Connection) (any, error) { return nil, nil })
	if !errors.As(err, &toolErr) || toolErr.Code != ErrBusy {
		t.Fatalf("want BUSY, got %v", err)
	}
}

func TestToToolError(t *testing.T) {
	if got := ToToolError(&TimeoutUnavailableError{}); got.Code != ErrTimeoutUnavailable {
		t.Fatalf("want TIMEOUT_UNAVAILABLE, got %s", got.Code)
	}
	if got := ToToolError(&QueryTimeoutError{}); got.Code != ErrQueryTimeout {
		t.Fatalf("want QUERY_TIMEOUT, got %s", got.Code)
	}
	if got := ToToolError(context.DeadlineExceeded); got.Code != ErrQueryTimeout {
		t.Fatalf("want QUERY_TIMEOUT for ctx deadline, got %s", got.Code)
	}
	// Redaction
	got := ToToolError(errors.New("connect postgres://admin:s3cret@host:5432/db password=hunter2 failed"))
	if got.Code != ErrDatabaseError {
		t.Fatalf("want DATABASE_ERROR, got %s", got.Code)
	}
	if strings.Contains(got.Message, "s3cret") || strings.Contains(got.Message, "hunter2") {
		t.Fatalf("credential leaked: %s", got.Message)
	}
	if !strings.Contains(got.Message, "***@") {
		t.Fatalf("expected redacted userinfo: %s", got.Message)
	}
}

func TestGeneratedUsernameAndPrepare(t *testing.T) {
	// Deterministic per accountRef
	u1, _ := generatedUsername(engines.KindPostgres, "ref-1")
	u1b, _ := generatedUsername(engines.KindPostgres, "ref-1")
	if u1 != u1b || !strings.HasPrefix(u1, "kdbmcp_") || len(u1) != len("kdbmcp_")+sqlUsernameHashLength {
		t.Fatalf("bad username: %q vs %q", u1, u1b)
	}
	um, _ := generatedUsername(engines.KindMySQL, "ref-1")
	if len(um) != len("kdbmcp_")+mysqlUsernameHashLength {
		t.Fatalf("bad mysql username len: %d", len(um))
	}

	// PrepareAccount postgres
	db := "appdb"
	host := "localhost"
	user := "admin"
	p := &store.Profile{
		ID: "p1", Kind: engines.KindPostgres, Name: "pg",
		Host: &host, Database: &db, Username: &user,
	}
	cred, err := PrepareAccount(p, "ref-9")
	if err != nil {
		t.Fatal(err)
	}
	if cred.Kind != engines.KindPostgres || cred.Username == "" || cred.Password == "" {
		t.Fatalf("bad bundle: %+v", cred)
	}
	expected, _ := generatedUsername(engines.KindPostgres, "ref-9")
	if cred.Username != expected {
		t.Fatalf("username mismatch")
	}
	if !IsManagedCredentialForProfile(p, "ref-9", cred) {
		t.Fatal("credential should match profile")
	}
	if IsManagedCredentialForProfile(p, "other-ref", cred) {
		t.Fatal("credential must not match a different accountRef")
	}

	// PrepareAccount mongo
	connStr := "mongodb://admin:pw@localhost:27017/?authSource=admin"
	pm := &store.Profile{
		ID: "m1", Kind: engines.KindMongoDB, Name: "mongo",
		ConnectionString: &connStr, Database: &db,
	}
	mcred, err := PrepareAccount(pm, "ref-3")
	if err != nil {
		t.Fatal(err)
	}
	if !IsManagedCredentialForProfile(pm, "ref-3", mcred) {
		t.Fatalf("mongo credential should verify: %s", mcred.ConnectionString)
	}
	parsed, err := parseMongoURI(mcred.ConnectionString)
	if err != nil {
		t.Fatal(err)
	}
	muser, _ := generatedUsername(engines.KindMongoDB, "ref-3")
	if parsed.username != muser || parsed.password == "" {
		t.Fatalf("bad mongo creds: %q", parsed.username)
	}
	if parsed.search.Get("authSource") != "appdb" {
		t.Fatalf("authSource not set to profile database: %s", parsed.search.Get("authSource"))
	}
}

func TestPortUpdateAndRotate(t *testing.T) {
	r, st := newTestRuntime(t)
	r.bind(0)
	first := r.GetStatus().Port
	if first == 0 {
		t.Fatal("no port bound")
	}
	// UpdatePort persists + rebinds on a real port
	free, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	freePort := int64(free.Addr().(*net.TCPAddr).Port)
	free.Close()
	if err := r.UpdatePort(freePort); err != nil {
		t.Fatal(err)
	}
	if r.GetStatus().Port != freePort {
		t.Fatalf("bound port %d != %d", r.GetStatus().Port, freePort)
	}
	settings, err := st.GetMCPSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.Port != freePort {
		t.Fatalf("persisted port %d != %d", settings.Port, freePort)
	}
	// Token rotation persists + returns
	old := r.Token()
	tok, err := r.RotateToken()
	if err != nil {
		t.Fatal(err)
	}
	if tok == old || r.Token() != tok {
		t.Fatal("token not rotated")
	}
	settings, _ = st.GetMCPSettings()
	if settings.Token != tok {
		t.Fatal("rotated token not persisted")
	}
}
