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
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/ai"
	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/engines/postgres"
	"github.com/asta-nguyen/kamehadb/internal/mongo"
	"github.com/asta-nguyen/kamehadb/internal/sqlsafety"
	"github.com/asta-nguyen/kamehadb/internal/store"
	"github.com/asta-nguyen/kamehadb/internal/terminal"
)

// AiService replaces routes/ai.ts. Chat streams over `chat:<requestId>`
// events instead of an SSE response; each payload is {type, delta|message}.
type AiService struct {
	st    *store.Store
	reg   *engines.Registry
	mongo *MongoService
	cache *ttlCache
	emit  terminal.EmitFunc

	chatsMu sync.Mutex
	chats   map[string]context.CancelFunc
}

func NewAiService(st *store.Store, reg *engines.Registry, mongoSvc *MongoService, _ *SqlService, cache *ttlCache, emit terminal.EmitFunc) *AiService {
	return &AiService{st: st, reg: reg, mongo: mongoSvc, cache: cache, emit: emit, chats: map[string]context.CancelFunc{}}
}

// --- settings -------------------------------------------------------------

func (s *AiService) GetAISettings() (*store.AISettings, error) {
	return s.st.GetAISettings()
}

// SaveAISettings mirrors POST /ai/settings including the active-provider
// validation.
func (s *AiService) SaveAISettings(input store.AISettings) error {
	active, ok := input.Providers[input.ActiveProvider]
	if !ok || !active.Enabled {
		return errors.New("Active provider must be enabled")
	}
	if msg := ai.ValidateConfig(input.ActiveProvider, ai.ProviderConfig(active)); msg != "" {
		return errors.New(msg)
	}
	return s.st.SaveAISettings(input)
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
}

var sqlFence = regexp.MustCompile("(?s)```sql\n?(.*?)```")

func newRequestID() string {
	b := make([]byte, 10)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
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
	var ddl, mongoSchema, vectorPrompt, connectionKind string
	var profile *store.Profile

	if input.ConnectionID != "" {
		p, err := s.st.GetProfile(input.ConnectionID)
		if err != nil {
			return "", err
		}
		profile = p
		if profile != nil {
			connectionKind = profile.Kind
		}

		cacheKey := "ai-schema:" + input.ConnectionID + ":sql"
		if input.MongoDatabase != "" {
			cacheKey = "ai-schema:" + input.ConnectionID + ":mongo:" + input.MongoDatabase
			if cached := s.cache.get(cacheKey, aiSchemaCacheTime); cached != nil {
				mongoSchema = cached.(string)
			}
		} else if cached := s.cache.get(cacheKey, aiSchemaCacheTime); cached != nil {
			ddl = cached.(string)
		}

		if ddl == "" && mongoSchema == "" && profile != nil {
			switch profile.Kind {
			case engines.KindMongoDB:
				adapter, err := s.mongo.getAdapter(input.ConnectionID)
				if err != nil {
					return "", errors.New("Schema context is unavailable due to an error")
				}
				mongoSchema, err = s.buildMongoSchemaContext(ctx, adapter, input.MongoDatabase)
				if err != nil {
					return "", errors.New("Schema context is unavailable due to an error")
				}
				s.cache.set(cacheKey, mongoSchema)
			case engines.KindRedis:
				// No schema context for redis, same as the route.
			default:
				adapter, err := s.reg.Get(ctx, input.ConnectionID)
				if err != nil {
					return "", errors.New("Schema context is unavailable due to an error")
				}
				if input.TableID != "" {
					ddl, err = ai.BuildTableSchemaContext(ctx, adapter, input.TableID)
					if err != nil {
						return "", errors.New("Schema context is unavailable due to an error")
					}
					if ddl != "" {
						s.cache.set("ai-schema:"+input.ConnectionID+":sql:"+input.TableID, ddl)
					}
				}
				if ddl == "" {
					if latestUserMsg != "" {
						hits, err := ai.SearchRelevantSchema(ctx, s.st, input.ConnectionID, latestUserMsg, providerName, ai.ProviderConfig(config), 5)
						if err == nil && len(hits) > 0 {
							var parts []string
							for _, h := range hits {
								parts = append(parts, h.DDL)
							}
							ddl = strings.Join(parts, "\n\n")
						}
					}
					if ddl == "" {
						ddl, err = ai.BuildSchemaContext(ctx, adapter)
						if err != nil {
							return "", errors.New("Schema context is unavailable due to an error")
						}
					}
					s.cache.set(cacheKey, ddl)
				}
				if profile.Kind == engines.KindPostgres {
					vectorPrompt = s.resolvePostgresVectorPrompt(ctx, input.ConnectionID, profile)
				}
			}
		}
		if profile != nil && profile.Kind == engines.KindPostgres && vectorPrompt == "" {
			vectorPrompt = s.resolvePostgresVectorPrompt(ctx, input.ConnectionID, profile)
		}
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

	systemPrompt := buildSystemPrompt(ddl, mongoSchema, connectionKind, vectorPrompt)
	llmMessages := append([]ai.ChatMessage{{Role: "system", Content: systemPrompt}}, input.Messages...)
	isSQL := connectionKind != "" && connectionKind != engines.KindMongoDB &&
		connectionKind != engines.KindRedis && connectionKind != engines.KindTigerBeetle &&
		connectionKind != engines.KindQdrant

	requestID := newRequestID()
	chatCtx, cancel := context.WithCancel(context.Background())
	s.chatsMu.Lock()
	s.chats[requestID] = cancel
	s.chatsMu.Unlock()

	go s.runChat(chatCtx, requestID, input, llmMessages, providerName, config, isSQL, profile)
	return requestID, nil
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

func (s *AiService) runChat(ctx context.Context, requestID string, input ChatInput, llmMessages []ai.ChatMessage, providerName string, config store.AIProviderConfig, isSQL bool, profile *store.Profile) {
	defer func() {
		s.chatsMu.Lock()
		delete(s.chats, requestID)
		s.chatsMu.Unlock()
	}()

	// Step 1: collect the SQL generation silently.
	var sqlGeneration strings.Builder
	err := ai.ChatStream(ctx, providerName, ai.ProviderConfig(config), llmMessages, func(d string) {
		sqlGeneration.WriteString(d)
	})
	if err != nil {
		s.emitChat(requestID, chatEvent{Type: "error", Message: err.Error()})
		return
	}
	generated := sqlGeneration.String()
	finalAnswer := ""

	// Step 2: execute fenced SQL against the connection, then ask for the
	// final answer with real rows.
	if isSQL && input.ConnectionID != "" && profile != nil {
		queries := extractSQLQueries(generated)
		if len(queries) > 0 {
			adapter, err := s.reg.Get(ctx, input.ConnectionID)
			if err == nil {
				var allRows []map[string]any
				var errMessage string
				for _, q := range queries {
					if safe, reason := sqlsafety.Check(q); !safe {
						errMessage = reason
						if errMessage == "" {
							errMessage = "The generated query was not read-only"
						}
						continue
					}
					result, err := adapter.RunQuery(ctx, engines.RunQueryInput{Query: q})
					if err != nil {
						errMessage = err.Error()
						continue
					}
					allRows = append(allRows, result.Rows...)
				}
				var resultBlock []byte
				if len(allRows) > 0 {
					n := len(allRows)
					if n > 50 {
						n = 50
					}
					resultBlock, _ = json.MarshalIndent(allRows[:n], "", "  ")
				} else {
					resultBlock, _ = json.Marshal(map[string]string{"error": errMessage})
				}
				answerMessages := append(append([]ai.ChatMessage{}, llmMessages...),
					ai.ChatMessage{Role: "assistant", Content: generated},
					ai.ChatMessage{Role: "user", Content: "The SQL query returned these results. Put the answer FIRST as a natural-language sentence, then put the SQL query in a ```sql``` code block at the bottom:\n\n" + string(resultBlock)})
				var final strings.Builder
				streamErr := ai.ChatStream(ctx, providerName, ai.ProviderConfig(config), answerMessages, func(d string) {
					final.WriteString(d)
					s.emitChat(requestID, chatEvent{Type: "content", Delta: d})
				})
				if streamErr != nil {
					s.emitChat(requestID, chatEvent{Type: "error", Message: streamErr.Error()})
					return
				}
				finalAnswer = final.String()
			}
		}
	}

	// No SQL queries found — stream the original response as one delta.
	if finalAnswer == "" {
		finalAnswer = generated
		s.emitChat(requestID, chatEvent{Type: "content", Delta: generated})
	}

	if input.ConnectionID != "" && finalAnswer != "" {
		var db *string
		if input.MongoDatabase != "" {
			db = &input.MongoDatabase
		}
		_, _ = s.st.SaveChatMessage(input.ConnectionID, "assistant", finalAnswer, db)
	}
	s.emitChat(requestID, chatEvent{Type: "done"})
}

func extractSQLQueries(text string) []string {
	var out []string
	for _, m := range sqlFence.FindAllStringSubmatch(text, -1) {
		if q := strings.TrimSpace(m[1]); q != "" {
			out = append(out, q)
		}
	}
	return out
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
		prompt += fmt.Sprintf("\n\nCurrent connection: %s (SQL).\n- Use ```sql``` blocks only. Do NOT use ```javascript``` or ```js``` — this is a SQL database, not MongoDB.\n- The system will automatically run the SQL query and feed the results back to you for your final answer, so you don't need to guess row counts or values.\n- Write queries directly without extra back-and-forth.", connectionKind)
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
