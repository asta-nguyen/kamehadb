package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/acp"
	"github.com/asta-nguyen/kamehadb/internal/ai"
	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/engines/postgres"
	"github.com/asta-nguyen/kamehadb/internal/mongo"
	"github.com/asta-nguyen/kamehadb/internal/store"
	"github.com/asta-nguyen/kamehadb/internal/terminal"
)

// acpRunner is the ACP runtime surface AiService drives. It is an interface so
// tests can substitute a scripted agent for the real process.
type acpRunner interface {
	RunTurn(ctx context.Context, in acp.TurnInput) (acp.TurnResult, error)
	RespondPermission(id, optionID string) error
	CloseAll()
}

// mcpTuner issues volatile per-turn, profile-scoped MCP tokens.
type mcpTuner interface {
	IssueSessionToken(profileID string) (endpoint, token string, eligible bool)
	RevokeSessionToken(token string)
}

// AiService replaces routes/ai.ts. Chat streams over `chat:<requestId>`
// events instead of an SSE response; each payload is {type, delta|message}.
type AiService struct {
	st    *store.Store
	reg   *engines.Registry
	mongo *MongoService
	cache *ttlCache
	emit  terminal.EmitFunc
	acp   acpRunner
	mcp   mcpTuner

	chatsMu sync.Mutex
	chats   map[string]context.CancelFunc
}

func NewAiService(st *store.Store, reg *engines.Registry, mongoSvc *MongoService, _ *SqlService, cache *ttlCache, emit terminal.EmitFunc, acpRuntime acpRunner, mcpRuntime mcpTuner) *AiService {
	return &AiService{
		st: st, reg: reg, mongo: mongoSvc, cache: cache, emit: emit,
		acp: acpRuntime, mcp: mcpRuntime, chats: map[string]context.CancelFunc{},
	}
}

// --- settings -------------------------------------------------------------

func (s *AiService) GetAISettings() (*store.AISettings, error) {
	return s.st.GetAISettings()
}

// SaveAISettings mirrors POST /ai/settings including the active-provider
// validation. When a fixed ACP agent is selected, provider credentials are not
// required: the agent supplies its own model backend, so only the preset id is
// validated.
func (s *AiService) SaveAISettings(input store.AISettings) error {
	if err := validateChatAgent(input.ActiveChatAgent); err != nil {
		return err
	}
	// ACP selected: the preset id is validated and the agent supplies its own
	// model backend, so provider credentials are not required.
	if input.ActiveChatAgent != nil && *input.ActiveChatAgent != "" {
		return s.st.SaveAISettings(input)
	}
	active, ok := input.Providers[input.ActiveProvider]
	if !ok || !active.Enabled {
		return errors.New("Active provider must be enabled")
	}
	if msg := ai.ValidateConfig(input.ActiveProvider, ai.ProviderConfig(active)); msg != "" {
		return errors.New(msg)
	}
	return s.st.SaveAISettings(input)
}

// validateChatAgent rejects an unknown preset id before any save or turn.
func validateChatAgent(agent *string) error {
	if agent == nil || *agent == "" {
		return nil
	}
	if !acp.IsValidID(*agent) {
		return fmt.Errorf("Unknown ACP agent: %s", *agent)
	}
	return nil
}

// --- models proxy ---------------------------------------------------------

// ListModels proxies {baseUrl}/models with the same SSRF guard as the route.
func (s *AiService) ListModels(baseURL, apiKey string) ([]string, error) {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return nil, errors.New("baseUrl is required")
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Hostname() == "" {
		return nil, errors.New("The provided baseUrl is not a valid URL")
	}
	host := parsed.Hostname()
	if blockedModelHost(host) {
		return nil, errors.New("Requests to private or internal hosts are not allowed")
	}

	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(baseURL, "/")+"/models", nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		errBody, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		snip := strings.TrimSpace(string(errBody))
		if len(snip) > 200 {
			snip = snip[:200]
		}
		return nil, fmt.Errorf("Remote returned %d: %s", res.StatusCode, snip)
	}
	var data struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return nil, err
	}
	models := make([]string, 0, len(data.Data))
	for _, m := range data.Data {
		if m.ID != "" {
			models = append(models, m.ID)
		}
	}
	return models, nil
}

// blockedModelHost rejects localhost, private/link-local IPs, .local/.internal
// names, and the cloud metadata endpoints — the route's SSRF guard.
func blockedModelHost(host string) bool {
	h := strings.ToLower(host)
	if h == "localhost" || h == "0.0.0.0" || h == "metadata.google.internal" ||
		strings.HasSuffix(h, ".local") || strings.HasSuffix(h, ".internal") {
		return true
	}
	ip := net.ParseIP(h)
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()
}

// --- embeddings -----------------------------------------------------------

func (s *AiService) CreateEmbedding(text, provider, model string) (map[string]any, error) {
	if text == "" {
		return nil, errors.New("text is required")
	}
	settings, err := s.st.GetAISettings()
	if err != nil {
		return nil, err
	}
	name := provider
	if name == "" {
		name = settings.ActiveProvider
	}
	cfg, ok := settings.Providers[name]
	if !ok {
		return nil, fmt.Errorf("Provider %q has no configuration", name)
	}
	if !cfg.Enabled {
		return nil, fmt.Errorf("Provider %q is not enabled", name)
	}
	if msg := ai.ValidateConfig(name, ai.ProviderConfig(cfg)); msg != "" {
		return nil, errors.New(msg)
	}
	vec := ai.CreateEmbedding(context.Background(), name, ai.ProviderConfig(cfg), text, model)
	return map[string]any{"vector": vec, "dimensions": len(vec)}, nil
}

// --- chat history ---------------------------------------------------------

func (s *AiService) GetChatHistory(connectionID string, limit int, mongoDatabase string) (map[string]any, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	var db *string
	if mongoDatabase != "" {
		db = &mongoDatabase
	}
	messages, err := s.st.GetChatMessages(connectionID, limit, db)
	if err != nil {
		return nil, err
	}
	return map[string]any{"messages": messages}, nil
}

func (s *AiService) ClearChatHistory(connectionID, mongoDatabase string) error {
	var db *string
	if mongoDatabase != "" {
		db = &mongoDatabase
	}
	return s.st.ClearChatMessages(connectionID, db)
}

func (s *AiService) ClearSchemaCache(connectionID, mongoDatabase string) error {
	if mongoDatabase != "" {
		s.cache.delete("ai-schema:" + connectionID + ":mongo:" + mongoDatabase)
	} else {
		s.cache.clearSchema(connectionID)
	}
	return nil
}

// --- chat streaming -------------------------------------------------------

// ChatInput mirrors the POST /ai/chat body.
type ChatInput struct {
	ConnectionID  string           `json:"connectionId,omitempty"`
	MongoDatabase string           `json:"mongoDatabase,omitempty"`
	TableID       string           `json:"tableId,omitempty"`
	Messages      []ai.ChatMessage `json:"messages"`
	Provider      string           `json:"provider,omitempty"`
	Model         string           `json:"model,omitempty"`
}

type chatEvent struct {
	Type    string `json:"type"`
	Delta   string `json:"delta,omitempty"`
	Message string `json:"message,omitempty"`

	// ACP-only fields: tool activity, permission prompts, and their options.
	ToolID       string                 `json:"toolId,omitempty"`
	Title        string                 `json:"title,omitempty"`
	Status       string                 `json:"status,omitempty"`
	PermissionID string                 `json:"permissionId,omitempty"`
	Options      []acp.PermissionOption `json:"options,omitempty"`
}

func newRequestID() string {
	b := make([]byte, 10)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// schemaCacheKey derives the TTL-cache key for a chat's schema context:
// database-scoped for MongoDB, table-scoped when a table is selected, and
// connection-scoped otherwise. Reads and writes share this function so a
// cached entry is always read back under the key it was written with. (Why)
func schemaCacheKey(connectionID, tableID, mongoDatabase string) string {
	switch {
	case mongoDatabase != "":
		return "ai-schema:" + connectionID + ":mongo:" + mongoDatabase
	case tableID != "":
		return "ai-schema:" + connectionID + ":sql:" + tableID
	default:
		return "ai-schema:" + connectionID + ":sql"
	}
}

// StartChat validates synchronously (like the route's pre-stream phase), then
// streams the answer over `chat:<id>` events. Returns the request id.
func (s *AiService) StartChat(input ChatInput) (string, error) {
	var latestUserMsg string
	for i := len(input.Messages) - 1; i >= 0; i-- {
		if input.Messages[i].Role == "user" {
			latestUserMsg = input.Messages[i].Content
			break
		}
	}

	settings, err := s.st.GetAISettings()
	if err != nil {
		return "", err
	}
	// ACP mode: a fixed local agent is the chat backend, so provider
	// credentials and provider-backed embedding are not used for the turn. (Why)
	if settings.ActiveChatAgent != nil && *settings.ActiveChatAgent != "" {
		return s.startAcpChat(input, latestUserMsg, *settings.ActiveChatAgent)
	}
	providerName := input.Provider
	if providerName == "" {
		providerName = settings.ActiveProvider
	}
	providerCfg, ok := settings.Providers[providerName]
	if !ok {
		return "", fmt.Errorf("Provider %q has no configuration", providerName)
	}
	if !providerCfg.Enabled {
		return "", fmt.Errorf("Provider %q is not enabled", providerName)
	}
	if msg := ai.ValidateConfig(providerName, ai.ProviderConfig(providerCfg)); msg != "" {
		return "", errors.New(msg)
	}
	config := providerCfg
	if input.Model != "" {
		config.Model = input.Model
	}

	ctx := context.Background()
	cc, err := s.buildChatContext(ctx, input, providerName, config, latestUserMsg, true)
	if err != nil {
		return "", err
	}

	if input.ConnectionID != "" && latestUserMsg != "" {
		var db *string
		if input.MongoDatabase != "" {
			db = &input.MongoDatabase
		}
		if _, err := s.st.SaveChatMessage(input.ConnectionID, "user", latestUserMsg, db); err != nil {
			return "", err
		}
	}

	systemPrompt := buildSystemPrompt(cc.ddl, cc.mongoSchema, cc.connectionKind, cc.vectorPrompt)
	llmMessages := append([]ai.ChatMessage{{Role: "system", Content: systemPrompt}}, input.Messages...)

	requestID := newRequestID()
	chatCtx, cancel := context.WithCancel(context.Background())
	s.chatsMu.Lock()
	s.chats[requestID] = cancel
	s.chatsMu.Unlock()

	go s.runChat(chatCtx, requestID, input, llmMessages, providerName, config)
	return requestID, nil
}

// chatContext is the connection-derived context shared by the provider and ACP
// paths. Provider-only fields stay empty on the ACP path.
type chatContext struct {
	ddl            string
	mongoSchema    string
	vectorPrompt   string
	connectionKind string
	profile        *store.Profile
}

// buildChatContext resolves the schema context for a turn. useProvider gates the
// provider-backed steps (embedding search and the Postgres vector prompt) so an
// ACP turn never contacts KamehaDB's provider or embedding endpoint. (Why)
func (s *AiService) buildChatContext(ctx context.Context, input ChatInput, providerName string, config store.AIProviderConfig, latestUserMsg string, useProvider bool) (chatContext, error) {
	var cc chatContext
	if input.ConnectionID == "" {
		return cc, nil
	}
	p, err := s.st.GetProfile(input.ConnectionID)
	if err != nil {
		return cc, err
	}
	cc.profile = p
	if p != nil {
		cc.connectionKind = p.Kind
	}

	// Reads and writes share schemaCacheKey so a cached entry is always read
	// back under the key it was written with; a table-scoped chat reads the
	// table key, so a connection-level entry cannot shadow the selected
	// table's context. (Why)
	cacheKey := schemaCacheKey(input.ConnectionID, input.TableID, input.MongoDatabase)
	if cached := s.cache.get(cacheKey, aiSchemaCacheTime); cached != nil {
		if input.MongoDatabase != "" {
			cc.mongoSchema = cached.(string)
		} else {
			cc.ddl = cached.(string)
		}
	}

	if cc.ddl == "" && cc.mongoSchema == "" && p != nil {
		switch p.Kind {
		case engines.KindMongoDB:
			adapter, err := s.mongo.getAdapter(input.ConnectionID)
			if err != nil {
				return cc, errors.New("Schema context is unavailable due to an error")
			}
			cc.mongoSchema, err = s.buildMongoSchemaContext(ctx, adapter, input.MongoDatabase)
			if err != nil {
				return cc, errors.New("Schema context is unavailable due to an error")
			}
			s.cache.set(cacheKey, cc.mongoSchema)
		case engines.KindRedis:
			// No schema context for redis, same as the route.
		default:
			adapter, err := s.reg.Get(ctx, input.ConnectionID)
			if err != nil {
				return cc, errors.New("Schema context is unavailable due to an error")
			}
			if input.TableID != "" {
				cc.ddl, err = ai.BuildTableSchemaContext(ctx, adapter, input.TableID)
				if err != nil {
					return cc, errors.New("Schema context is unavailable due to an error")
				}
				if cc.ddl != "" {
					s.cache.set(schemaCacheKey(input.ConnectionID, input.TableID, ""), cc.ddl)
				}
			}
			if cc.ddl == "" {
				if useProvider && latestUserMsg != "" {
					hits, err := ai.SearchRelevantSchema(ctx, s.st, input.ConnectionID, latestUserMsg, providerName, ai.ProviderConfig(config), 5)
					if err == nil && len(hits) > 0 {
						var parts []string
						for _, h := range hits {
							parts = append(parts, h.DDL)
						}
						cc.ddl = strings.Join(parts, "\n\n")
					}
				}
				if cc.ddl == "" {
					cc.ddl, err = ai.BuildSchemaContext(ctx, adapter)
					if err != nil {
						return cc, errors.New("Schema context is unavailable due to an error")
					}
				}
				// Full-schema fallbacks always cache at connection scope, so a
				// table-scoped chat cannot pin a full-schema entry under its
				// table key. (Why)
				s.cache.set(schemaCacheKey(input.ConnectionID, "", ""), cc.ddl)
			}
			if useProvider && p.Kind == engines.KindPostgres {
				cc.vectorPrompt = s.resolvePostgresVectorPrompt(ctx, input.ConnectionID, p)
			}
		}
	}
	if useProvider && p != nil && p.Kind == engines.KindPostgres && cc.vectorPrompt == "" {
		cc.vectorPrompt = s.resolvePostgresVectorPrompt(ctx, input.ConnectionID, p)
	}
	return cc, nil
}

// startAcpChat validates an ACP turn, optionally attaches the selected
// profile's scoped MCP endpoint, and streams the agent's events. Returns the
// request id.
func (s *AiService) startAcpChat(input ChatInput, latestUserMsg, agentID string) (string, error) {
	if s.acp == nil {
		return "", errors.New("ACP runtime is unavailable")
	}

	ctx := context.Background()
	cc, err := s.buildChatContext(ctx, input, "", store.AIProviderConfig{}, latestUserMsg, false)
	if err != nil {
		return "", err
	}

	// Attach MCP only for an already-enabled selected profile while the
	// listener is up; the token is volatile and scoped to this turn. (Why)
	var mcpCfg *acp.MCPConfig
	var mcpToken string
	var schemaOnlyNotice string
	if input.ConnectionID != "" {
		notice := "This connection has not enabled read-only MCP, so the agent works from the schema text only."
		if s.mcp != nil {
			endpoint, token, eligible := s.mcp.IssueSessionToken(input.ConnectionID)
			if eligible {
				mcpCfg = &acp.MCPConfig{Endpoint: endpoint, Token: token}
				mcpToken = token
			} else {
				schemaOnlyNotice = notice
			}
		} else {
			schemaOnlyNotice = notice
		}
	}

	// Persist the user's message with the same connection-scoped history the
	// provider path uses.
	if input.ConnectionID != "" && latestUserMsg != "" {
		var db *string
		if input.MongoDatabase != "" {
			db = &input.MongoDatabase
		}
		if _, err := s.st.SaveChatMessage(input.ConnectionID, "user", latestUserMsg, db); err != nil {
			return "", err
		}
	}

	messages := make([]acp.Message, 0, len(input.Messages))
	for _, m := range input.Messages {
		role := acp.RoleUser
		if m.Role == "assistant" {
			role = acp.RoleAssistant
		}
		messages = append(messages, acp.Message{Role: role, Content: m.Content})
	}

	requestID := newRequestID()
	chatCtx, cancel := context.WithCancel(context.Background())
	s.chatsMu.Lock()
	s.chats[requestID] = cancel
	s.chatsMu.Unlock()

	turn := acp.TurnInput{
		Agent:    acp.AgentID(agentID),
		Messages: messages,
		Context:  buildAcpContext(cc, mcpCfg != nil),
		MCP:      mcpCfg,
		OnNotice: func(msg string) { s.emitChat(requestID, chatEvent{Type: "notice", Message: msg}) },
	}

	go s.runAcpChat(chatCtx, requestID, input, turn, mcpToken, schemaOnlyNotice)
	return requestID, nil
}

// buildAcpContext assembles the schema text sent as ACP context. Unlike the
// provider path it never triggers embedding or vector lookups. (Why)
func buildAcpContext(cc chatContext, mcpAttached bool) string {
	var parts []string
	if mcpAttached {
		parts = append(parts, "You have read-only access to the selected database through an MCP server named \"kamehadb\". Use it to inspect the schema and run focused read-only queries. Never attempt writes.")
	}
	if cc.ddl != "" {
		parts = append(parts, "Database schema:\n"+cc.ddl)
	}
	if cc.mongoSchema != "" {
		parts = append(parts, cc.mongoSchema)
	}
	return strings.Join(parts, "\n\n")
}

// runAcpChat drives one ACP turn, mapping agent callbacks to chat events and
// persisting the completed answer through the existing history store.
func (s *AiService) runAcpChat(ctx context.Context, requestID string, input ChatInput, turn acp.TurnInput, mcpToken, schemaOnlyNotice string) {
	defer func() {
		s.chatsMu.Lock()
		delete(s.chats, requestID)
		s.chatsMu.Unlock()
		if mcpToken != "" && s.mcp != nil {
			s.mcp.RevokeSessionToken(mcpToken)
		}
	}()

	if schemaOnlyNotice != "" {
		s.emitChat(requestID, chatEvent{Type: "notice", Message: schemaOnlyNotice})
	}

	var mu sync.Mutex
	var answer strings.Builder
	turn.OnText = func(delta string) {
		mu.Lock()
		answer.WriteString(delta)
		mu.Unlock()
		s.emitChat(requestID, chatEvent{Type: "content", Delta: delta})
	}
	turn.OnTool = func(a acp.ToolActivity) {
		s.emitChat(requestID, chatEvent{Type: "tool", ToolID: a.ID, Title: a.Title, Status: a.Status})
	}
	turn.OnPermission = func(p acp.PermissionRequest) {
		s.emitChat(requestID, chatEvent{Type: "permission", PermissionID: p.ID, Title: p.Title, Options: p.Options})
	}

	_, err := s.acp.RunTurn(ctx, turn)
	if err != nil {
		// A cancelled turn (user abort) is a normal stop, not an error.
		if ctx.Err() != nil {
			s.emitChat(requestID, chatEvent{Type: "done"})
			return
		}
		s.emitChat(requestID, chatEvent{Type: "error", Message: err.Error()})
		return
	}

	mu.Lock()
	text := answer.String()
	mu.Unlock()
	if input.ConnectionID != "" && text != "" {
		var db *string
		if input.MongoDatabase != "" {
			db = &input.MongoDatabase
		}
		_, _ = s.st.SaveChatMessage(input.ConnectionID, "assistant", text, db)
	}
	s.emitChat(requestID, chatEvent{Type: "done"})
}

// RespondPermission resolves a pending ACP permission prompt. It validates the
// chat is still active, then delegates correlation-id and option validation to
// the ACP runtime.
func (s *AiService) RespondPermission(requestID, permissionID, optionID string) error {
	s.chatsMu.Lock()
	_, active := s.chats[requestID]
	s.chatsMu.Unlock()
	if !active {
		return fmt.Errorf("chat %q is not active", requestID)
	}
	if s.acp == nil {
		return errors.New("ACP runtime is unavailable")
	}
	return s.acp.RespondPermission(permissionID, optionID)
}

// Close aborts running turns and terminates ACP processes; called on shutdown
// before the MCP listener stops so no agent outlives the app.
func (s *AiService) Close() {
	if s.acp != nil {
		s.acp.CloseAll()
	}
	s.chatsMu.Lock()
	for _, cancel := range s.chats {
		cancel()
	}
	s.chatsMu.Unlock()
}

// CancelChat aborts a running stream — the AbortController.cancel port.
func (s *AiService) CancelChat(requestID string) {
	s.chatsMu.Lock()
	cancel := s.chats[requestID]
	s.chatsMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (s *AiService) emitChat(requestID string, ev chatEvent) {
	if s.emit != nil {
		s.emit("chat:"+requestID, ev)
	}
}

func (s *AiService) runChat(ctx context.Context, requestID string, input ChatInput, llmMessages []ai.ChatMessage, providerName string, config store.AIProviderConfig) {
	defer func() {
		s.chatsMu.Lock()
		delete(s.chats, requestID)
		s.chatsMu.Unlock()
	}()

	// Stream the provider response — including any fenced SQL — straight to the
	// chat. The AI flow never runs provider-generated SQL or sends database
	// result rows to the provider; the SQL editor is the explicit execution
	// path, so the user reviews and chooses when to run the query. (Why)
	var answer strings.Builder
	err := ai.ChatStream(ctx, providerName, ai.ProviderConfig(config), llmMessages, func(d string) {
		answer.WriteString(d)
		s.emitChat(requestID, chatEvent{Type: "content", Delta: d})
	})
	if err != nil {
		s.emitChat(requestID, chatEvent{Type: "error", Message: err.Error()})
		return
	}

	if finalAnswer := answer.String(); input.ConnectionID != "" && finalAnswer != "" {
		var db *string
		if input.MongoDatabase != "" {
			db = &input.MongoDatabase
		}
		_, _ = s.st.SaveChatMessage(input.ConnectionID, "assistant", finalAnswer, db)
	}
	s.emitChat(requestID, chatEvent{Type: "done"})
}

// buildMongoSchemaContext ports the route helper: db-scoped collections with
// sample-document fields, or all user databases as fallback.
func (s *AiService) buildMongoSchemaContext(ctx context.Context, adapter *mongo.Adapter, database string) (string, error) {
	var lines []string
	writeCollection := func(db, collName string) {
		stats, err := adapter.GetCollectionStats(ctx, db, collName)
		if err != nil {
			return
		}
		count := int64(0)
		if stats != nil {
			count = stats.DocumentCount
		}
		lines = append(lines, fmt.Sprintf("### %s (%d docs)", collName, count))
		if count > 0 {
			res, err := adapter.FindDocuments(ctx, mongo.FindDocumentsInput{Collection: collName, Database: db, Limit: 1})
			if err == nil && len(res.Documents) > 0 {
				sample := res.Documents[0]
				fields := make([]string, 0, 15)
				keys := make([]string, 0, len(sample))
				for k := range sample {
					keys = append(keys, k)
				}
				for i := 0; i < len(keys) && i < 15; i++ {
					k := keys[i]
					v := sample[k]
					typ := "object"
					switch v.(type) {
					case nil:
						typ = "null"
					case []any:
						typ = "array"
					case string:
						typ = "string"
					case bool:
						typ = "boolean"
					case float64, float32, int, int32, int64:
						typ = "number"
					}
					fields = append(fields, fmt.Sprintf("  %s: %s", k, typ))
				}
				lines = append(lines, "Fields:", strings.Join(fields, "\n"))
			}
		}
	}

	if database != "" {
		lines = append(lines, "## Database: "+database)
		collections, err := adapter.ListCollections(ctx, database)
		if err != nil {
			return "", err
		}
		for i, coll := range collections {
			if i >= 10 {
				break
			}
			writeCollection(database, coll.Name)
			lines = append(lines, "")
		}
		return strings.Join(lines, "\n"), nil
	}

	databases, err := adapter.ListDatabases(ctx)
	if err != nil {
		return "", err
	}
	if len(databases) == 0 {
		return "", nil
	}
	lines = append(lines, "MongoDB Databases:")
	system := map[string]bool{"admin": true, "local": true, "config": true}
	count := 0
	for _, db := range databases {
		if system[db.Name] || count >= 10 {
			continue
		}
		count++
		lines = append(lines, "## "+db.Name)
		collections, err := adapter.ListCollections(ctx, db.Name)
		if err != nil {
			continue
		}
		for i, coll := range collections {
			if i >= 10 {
				break
			}
			writeCollection(db.Name, coll.Name)
		}
		lines = append(lines, "")
	}
	return strings.Join(lines, "\n"), nil
}

// resolvePostgresVectorPrompt mirrors resolvePostgresVectorPrompt: cached per
// connection, capability probe failure → nil.
func (s *AiService) resolvePostgresVectorPrompt(ctx context.Context, connectionID string, profile *store.Profile) string {
	key := "ai-pgvector:" + connectionID
	if cached := s.cache.get(key, aiSchemaCacheTime); cached != nil {
		return cached.(string)
	}
	password, _ := s.st.GetProfilePassword(connectionID)
	var port int64
	if profile.Port != nil {
		port = *profile.Port
	}
	cp := engines.ConnProfile{
		Host:        strOf(profile.Host),
		Port:        port,
		Database:    strOf(profile.Database),
		Username:    strOf(profile.Username),
		Password:    password,
		HasPassword: true,
		SSL:         profile.SSL,
		SSLCACert:   strOf(profile.SSLCACert),
	}
	capability, err := postgres.DetectPgVectorCapability(ctx, cp)
	if err != nil || capability == nil || !capability.Available || len(capability.Columns) == 0 {
		return ""
	}
	var columns, indexes []string
	for i, c := range capability.Columns {
		if i >= 8 {
			break
		}
		columns = append(columns, fmt.Sprintf("- %s.%s.%s (%dd)", c.TableSchema, c.TableName, c.ColumnName, c.Dimensions))
	}
	for i, ix := range capability.Indexes {
		if i >= 8 {
			break
		}
		indexes = append(indexes, fmt.Sprintf("- %s.%s.%s via %s/%s", ix.TableSchema, ix.TableName, ix.ColumnName, ix.Method, ix.Operator))
	}
	parts := []string{
		"This PostgreSQL connection includes pgvector support for " + connectionID + ".",
		"When the user asks for vector similarity search, prefer native pgvector SQL with the vector operators below:",
		"- `<=>` for cosine distance",
		"- `<->` for L2 distance",
		"- `<#>` for inner product",
		"Vector columns:",
		strings.Join(columns, "\n"),
	}
	if len(indexes) > 0 {
		parts = append(parts, "Vector indexes:\n"+strings.Join(indexes, "\n"))
	}
	prompt := strings.Join(parts, "\n")
	s.cache.set(key, prompt)
	return prompt
}

func buildSystemPrompt(ddl, mongoSchema, connectionKind, vectorPrompt string) string {
	prompt := `You are a database assistant embedded in a database admin tool called kamehadb. Your job is to help users write queries and understand their data.

Rules:
- Be concise. Put the natural-language answer FIRST, then put the SQL query in a code block at the bottom. Never guess actual row counts or values — you only have the schema.
- Default to read-only queries. If the user asks for a write, note the risk before providing it.
- Always use the correct language tag for the code block (see per-database rules below).`

	switch connectionKind {
	case engines.KindRedis:
		prompt += "\n\nCurrent connection: Redis.\n- Use ```redis``` blocks with Redis CLI syntax only.\n- Prefer read-only commands: SCAN, TYPE, TTL, MEMORY USAGE, INFO, DBSIZE, HGETALL, LRANGE, SMEMBERS, ZRANGE.\n- Do NOT use SQL or JavaScript syntax."
	case engines.KindMongoDB:
		prompt += "\n\nCurrent connection: MongoDB.\n- Use ```javascript``` blocks for all queries (filter, find, aggregate, etc.).\n- Do NOT use SQL syntax.\n- Write the query using direct shell syntax: `db.collectionName.find(...)` or `db.collectionName.aggregate([...])`.\n- Prefix the query with a comment explaining what it does."
	case engines.KindTigerBeetle:
		prompt += "\n\nCurrent connection: TigerBeetle (financial transaction database).\n- Do NOT use SQL, MongoDB, or Redis syntax.\n- TigerBeetle is a double-entry accounting database with accounts and transfers.\n- Use the TigerBeetle CLI syntax or Node.js client API in ```javascript``` blocks.\n- Key operations: create_accounts, lookup_accounts, create_transfers, lookup_transfers, get_account_transfers, get_account_balances.\n- Accounts have: id (u128), debits_posted, debits_pending, credits_posted, credits_pending, flags, ledger, code.\n- Transfers have: id (u128), debit_account_id, credit_account_id, amount, flags, ledger, code.\n- Prefer read-only operations: lookup_accounts, lookup_transfers, get_account_balances."
	case "":
	default:
		prompt += fmt.Sprintf("\n\nCurrent connection: %s (SQL).\n- Use ```sql``` blocks only. Do NOT use ```javascript``` or ```js``` — this is a SQL database, not MongoDB.\n- The user reviews and runs your SQL in the editor; the system never executes it for you and never sends the results back. Never guess actual row counts or values — you only have the schema.\n- Write queries directly without extra back-and-forth.", connectionKind)
	}
	if ddl != "" {
		prompt += "\n\nThe current database schema is:\n\n" + ddl
	}
	if mongoSchema != "" {
		prompt += "\n\n" + mongoSchema
	}
	if vectorPrompt != "" {
		prompt += "\n\n" + vectorPrompt
	}
	return prompt
}
