// Package redis ports adapters/redis.ts on go-redis/v9.
package redis

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	goredis "github.com/redis/go-redis/v9"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	dbredis "github.com/asta-nguyen/kamehadb/dbcore/redis"
)

const (
	testConnectTimeout = 3 * time.Second
	connectTimeout     = 5 * time.Second
	defaultHost        = "localhost"

	defaultScanCount = 100
	maxScanCount     = 1000
	// String values move in labelled byte windows, never as clipped originals.
	stringWindowBytes = 64 << 10
	// Native SCAN replies can exceed a page; their unreturned tail lives in a
	// bounded remainder session instead of being silently dropped.
	scanSessionMaxBytes  = 8 << 20
	scanSessionPoolBytes = 32 << 20
	scanSessionMaxCount  = 16
	scanSessionTTL       = 5 * time.Minute
)

type Config struct {
	Host     string
	Port     int64
	Password string
	Database int
}

func newClient(cfg Config, dialTimeout time.Duration, noRetry bool) *goredis.Client {
	host := cfg.Host
	if host == "" {
		host = defaultHost
	}
	port := cfg.Port
	if port == 0 {
		port = int64(engines.DefaultPorts[engines.KindRedis])
	}
	maxRetries := 3
	if noRetry {
		maxRetries = -1 // fail fast, like retryStrategy: () => null
	}
	return goredis.NewClient(&goredis.Options{
		Addr:        fmt.Sprintf("%s:%d", host, port),
		Password:    cfg.Password,
		DB:          cfg.Database,
		DialTimeout: dialTimeout,
		MaxRetries:  maxRetries,
		// go-redis v9 negotiates RESP3 by default, which turns HGETALL, CONFIG GET
		// and XINFO replies into map[interface{}]interface{}: JSON cannot encode
		// that, so raw command results would never reach the UI. RESP2 keeps the
		// flat-array replies the previous ioredis-based sidecar produced.
		Protocol:              2,
		ContextTimeoutEnabled: true,
	})
}

type Adapter struct {
	cfg      Config
	client   *goredis.Client
	sessions *scanSessions
}

func New(cfg Config) *Adapter {
	// Ambiguous command failures must never replay a possibly completed write.
	return &Adapter{cfg: cfg, client: newClient(cfg, connectTimeout, true), sessions: newScanSessions()}
}

// A GUI request gets its own pool: cancellation closes only that request's
// sockets, including blocking commands, never another tab's shared client.
// Browse remainders stay on the shared store so a later page request can
// find them regardless of which request pool answered first.
func (a *Adapter) ForRequest(ctx context.Context) (dbredis.RequestOperations, func()) {
	owned := New(a.cfg)
	owned.sessions = a.sessions
	stop := context.AfterFunc(ctx, func() { _ = owned.client.Close() })
	return owned, func() { stop(); _ = owned.client.Close() }
}

type TestConnectionResult = engines.TestConnectionResult

// KeyEntry / KeyPage / RedisValue mirror the shared redis types.

// KeyPage keeps the opaque continuation as a string: native cursors can exceed
// JavaScript's safe-integer range, and a remainder lease is not a number.

// Scope is set by the service (the connection identity); it never crosses the
// wire. Continuations stay bound to the connection, key/type and pattern or
// page shape they were issued for.

// RedisValuePage is one bounded page of a key's value. Value's concrete shape
// depends on Type: *stringWindow for strings, []string for list/set members,
// []hashPair for hashes and []zsetMember for sorted sets.

type stringWindow struct {
	Data     string `json:"data"`
	Encoding string `json:"encoding"`
	Start    int64  `json:"start"`
	End      int64  `json:"end"`
	Total    int64  `json:"total"`
}

type hashPair struct {
	Field string `json:"field"`
	Value string `json:"value"`
}

type zsetMember struct {
	Member string  `json:"member"`
	Score  float64 `json:"score"`
	// ScoreText holds the exact score when it has no JSON number form (±Inf,
	// NaN); Score is 0 in that case.
	ScoreText string `json:"scoreText,omitempty"`
}

func (a *Adapter) TestConnection(ctx context.Context) (*TestConnectionResult, error) {
	if err := a.client.Ping(ctx).Err(); err != nil {
		return &TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	info, err := a.client.Info(ctx, "server").Result()
	if err != nil {
		return &TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	version := "Redis"
	if m := regexp.MustCompile(`redis_version:([\d.]+)`).FindStringSubmatch(info); len(m) > 1 {
		version = "Redis " + m[1]
	}
	return &TestConnectionResult{Success: true, ServerVersion: version}, nil
}

// --- opaque browse continuations ---

const (
	browseCursorVersion = 1
	cursorKindScan      = "scan"
	cursorKindRank      = "rank"
	cursorKindLease     = "lease"
)

type browseCursor struct {
	V      int    `json:"v"`
	Kind   string `json:"kind"`
	Native uint64 `json:"native,omitempty"`
	Lease  string `json:"lease,omitempty"`
	Pos    int64  `json:"pos,omitempty"`
	Ctx    string `json:"c"`
}

// cursorCtx binds a continuation to its scope, target and page shape so a
// stale or cross-connection cursor fails loudly instead of reading elsewhere.
func cursorCtx(scope, key, mode string) string {
	sum := sha256.Sum256([]byte(scope + "\x00" + key + "\x00" + mode))
	return base64.RawURLEncoding.EncodeToString(sum[:16])
}

func encodeBrowseCursor(c browseCursor) (string, error) {
	c.V = browseCursorVersion
	raw, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// maxBrowseCursorBytes mirrors the SQL cursor ceiling: a continuation is a
// small token, not a payload channel, so oversized input is rejected up front.
const maxBrowseCursorBytes = 8 << 10

func decodeBrowseCursor(s string) (browseCursor, error) {
	var c browseCursor
	if len(s) > maxBrowseCursorBytes {
		return c, errors.New("browse cursor is not readable; restart paging")
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return c, errors.New("browse cursor is not readable; restart paging")
	}
	if err := json.Unmarshal(raw, &c); err != nil || c.V != browseCursorVersion {
		return c, errors.New("browse cursor is not readable; restart paging")
	}
	return c, nil
}

func mustCursor(c browseCursor) string {
	s, err := encodeBrowseCursor(c)
	if err != nil {
		return ""
	}
	return s
}

// --- bounded remainder sessions ---

// A scanSession keeps the unreturned tail of one oversized native reply plus
// the native cursor needed to resume once it drains. Pages read a slice
// without consuming it, so two views paging the same lease do not eat each
// other's data; lifetime and byte bounds keep leftovers finite.
type scanSession struct {
	scope     string
	key       string
	kind      string
	items     []any
	native    uint64
	bytes     int64
	expiresAt time.Time
}

type scanSessions struct {
	mu     sync.Mutex
	items  map[string]*scanSession
	bytes  int64
	nextID uint64
}

func newScanSessions() *scanSessions {
	return &scanSessions{items: map[string]*scanSession{}}
}

var errRemainderLimit = errors.New("browse remainder exceeds the retained-overflow budget; restart the scan")

func (ss *scanSessions) put(scope, key, kind string, items []any, native uint64, itemBytes func(any) int64) (*scanSession, error) {
	var bytes int64
	for _, it := range items {
		bytes += itemBytes(it)
	}
	if bytes > scanSessionMaxBytes {
		return nil, errRemainderLimit
	}
	ss.mu.Lock()
	defer ss.mu.Unlock()
	now := time.Now()
	for id, s := range ss.items {
		if now.After(s.expiresAt) {
			ss.bytes -= s.bytes
			delete(ss.items, id)
		}
	}
	if len(ss.items) >= scanSessionMaxCount || ss.bytes+bytes > scanSessionPoolBytes {
		return nil, errRemainderLimit
	}
	ss.nextID++
	sess := &scanSession{
		scope:     scope,
		key:       key,
		kind:      kind,
		items:     items,
		native:    native,
		bytes:     bytes,
		expiresAt: now.Add(scanSessionTTL),
	}
	id := strconv.FormatUint(ss.nextID, 36) + "-" + strconv.FormatInt(now.UnixNano(), 36)
	ss.items[id] = sess
	ss.bytes += bytes
	return sess, nil
}

func (ss *scanSessions) find(id string) (*scanSession, bool) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	sess, ok := ss.items[id]
	if !ok {
		return nil, false
	}
	if time.Now().After(sess.expiresAt) {
		ss.bytes -= sess.bytes
		delete(ss.items, id)
		return nil, false
	}
	return sess, true
}

func (ss *scanSessions) release(id string) bool {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	sess, ok := ss.items[id]
	if !ok {
		return false
	}
	ss.bytes -= sess.bytes
	delete(ss.items, id)
	return true
}

func (ss *scanSessions) releaseAll() {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	ss.items = map[string]*scanSession{}
	ss.bytes = 0
}

func (ss *scanSessions) leaseID(sess *scanSession) string {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	for id, s := range ss.items {
		if s == sess {
			return id
		}
	}
	return ""
}

// --- paged browsing ---

var errCursorMismatch = errors.New("browse cursor no longer matches this key, pattern or connection; restart paging")

var errCursorExpired = errors.New("browse continuation expired or was released; restart paging")

// pageItems admits whole items under the row/byte budgets. A single item too
// large for an empty page fails loudly instead of being clipped.
func pageItems(items []any, maxRows, maxBytes int64, itemBytes func(any) int64) (admitted []any, rest []any, reason string, err error) {
	var bytes int64 = 2
	for i, it := range items {
		n := itemBytes(it)
		if bytes+n+1 > maxBytes {
			if len(admitted) == 0 {
				return nil, nil, "", fmt.Errorf("one complete %s exceeds the %d-byte browse limit; nothing was clipped", "item", engines.MaxPreviewResultBytes)
			}
			return admitted, items[i:], engines.LimitReasonBytes, nil
		}
		if int64(len(admitted)) >= maxRows {
			return admitted, items[i:], engines.LimitReasonRows, nil
		}
		admitted = append(admitted, it)
		bytes += n + 1
	}
	return admitted, nil, "", nil
}

// continueScan emits the continuation after a drained remainder: either a new
// native scan cursor or exhaustion.
func continueScan(scope, key, mode string, native uint64) (string, bool) {
	if native == 0 {
		return "", true
	}
	return mustCursor(browseCursor{Kind: cursorKindScan, Native: native, Ctx: cursorCtx(scope, key, mode)}), false
}

// jsonEncodedBytes measures an item's actual JSON length. Raw len() undercounts
// strings needing escapes, which could push the serialized response past the
// browse budget — byte accounting must track the wire encoding. (Why)
func jsonEncodedBytes(v any) int64 {
	b, err := json.Marshal(v)
	if err != nil {
		// Pathological input: assume every byte escapes to a \uXXXX pair.
		return int64(len(fmt.Sprint(v))) * 6
	}
	return int64(len(b))
}

// keyEntryBytes approximates the encoded size of one listed key.
func keyEntryBytes(key string) int64 {
	return jsonEncodedBytes(key) + 48
}

// pageCollectionScan emits one bounded page for SCAN-family data. A lease
// cursor replays a stored remainder; a scan cursor continues natively. The
// mode feeds the context binding: the key pattern for key scans, the value
// type for hash/set pages.
func (a *Adapter) pageCollectionScan(
	ctx context.Context,
	scope, key, mode, kind string,
	maxRows int64,
	c browseCursor,
	fetch func(native uint64) ([]any, uint64, error),
	itemBytes func(any) int64,
) (items []any, next string, done bool, reason string, err error) {
	ctxTag := cursorCtx(scope, key, mode)
	if c.Kind == cursorKindLease {
		// The lease is also bound to the scan context: key scans bind the
		// pattern only through Ctx, so a lease from pattern A must not replay
		// its remainder or resume the native cursor under pattern B.
		if c.Ctx != ctxTag {
			return nil, "", false, "", errCursorMismatch
		}
		sess, ok := a.sessions.find(c.Lease)
		if !ok {
			return nil, "", false, "", errCursorExpired
		}
		if sess.scope != scope || sess.kind != kind || sess.key != key {
			return nil, "", false, "", errCursorMismatch
		}
		if c.Pos < 0 || c.Pos > int64(len(sess.items)) {
			return nil, "", false, "", errCursorMismatch
		}
		admitted, leftover, r, err := pageItems(sess.items[c.Pos:], maxRows, engines.MaxPreviewResultBytes, itemBytes)
		if err != nil {
			return nil, "", false, "", err
		}
		nextPos := c.Pos + int64(len(admitted))
		if leftover == nil && nextPos >= int64(len(sess.items)) {
			// Remainder drained: resume or finish the native scan.
			a.sessions.release(c.Lease)
			n, d := continueScan(scope, key, mode, sess.native)
			return admitted, n, d, r, nil
		}
		return admitted, mustCursor(browseCursor{Kind: cursorKindLease, Lease: c.Lease, Pos: nextPos, Ctx: ctxTag}), false, r, nil
	}
	var native uint64
	if c.Kind != "" {
		if c.Kind != cursorKindScan || c.Ctx != ctxTag {
			return nil, "", false, "", errCursorMismatch
		}
		native = c.Native
	}
	batch, nextNative, err := fetch(native)
	if err != nil {
		return nil, "", false, "", err
	}
	admitted, leftover, reason, err := pageItems(batch, maxRows, engines.MaxPreviewResultBytes, itemBytes)
	if err != nil {
		return nil, "", false, "", err
	}
	if leftover != nil {
		// The native cursor already advanced; park the unreturned tail so the
		// next page replays it instead of skipping items.
		sess, err := a.sessions.put(scope, key, kind, leftover, nextNative, itemBytes)
		if err != nil {
			return nil, "", false, "", err
		}
		return admitted, mustCursor(browseCursor{Kind: cursorKindLease, Lease: a.sessions.leaseID(sess), Pos: 0, Ctx: ctxTag}), false, reason, nil
	}
	n, d := continueScan(scope, key, mode, nextNative)
	return admitted, n, d, reason, nil
}

// ScanKeys pages one SCAN step per request. COUNT is only a hint: an oversized
// native batch keeps its unreturned keys in a bounded remainder instead of
// silently dropping them.
func (a *Adapter) ScanKeys(ctx context.Context, in ScanKeysInput) (*KeyPage, error) {
	pattern := in.Pattern
	if pattern == "" {
		pattern = "*"
	}
	count := in.Count
	if count <= 0 {
		count = defaultScanCount
	}
	if count > maxScanCount {
		count = maxScanCount
	}
	var c browseCursor
	if in.Cursor != "" {
		var err error
		c, err = decodeBrowseCursor(in.Cursor)
		if err != nil {
			return nil, err
		}
	}
	admitted, next, done, reason, err := a.pageCollectionScan(ctx, in.Scope, "", pattern, "keys", count, c,
		func(native uint64) ([]any, uint64, error) {
			names, n, err := a.client.Scan(ctx, native, pattern, count).Result()
			if err != nil {
				return nil, 0, err
			}
			items := make([]any, len(names))
			for i, k := range names {
				items[i] = k
			}
			return items, n, nil
		},
		func(it any) int64 { return keyEntryBytes(it.(string)) },
	)
	if err != nil {
		return nil, err
	}
	page, err := a.entriesFor(ctx, admitted)
	if err != nil {
		return nil, err
	}
	return &KeyPage{Keys: page, NextCursor: next, Done: done, PayloadBytes: pageBytes(page), LimitReason: reason}, nil
}

func pageBytes(entries []KeyEntry) int64 {
	var n int64 = 2
	for _, e := range entries {
		n += keyEntryBytes(e.Key) + 1
	}
	return n
}

// entriesFor resolves TYPE/TTL for admitted names in one pipeline instead of
// two sequential round trips per key.
func (a *Adapter) entriesFor(ctx context.Context, names []any) ([]KeyEntry, error) {
	pipe := a.client.Pipeline()
	typeCmds := make([]*goredis.StatusCmd, len(names))
	ttlCmds := make([]*goredis.DurationCmd, len(names))
	for i, n := range names {
		key := n.(string)
		typeCmds[i] = pipe.Type(ctx, key)
		ttlCmds[i] = pipe.TTL(ctx, key)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return nil, err
	}
	entries := make([]KeyEntry, 0, len(names))
	for i, n := range names {
		typ, err := typeCmds[i].Result()
		if err != nil {
			return nil, err
		}
		ttl, err := ttlCmds[i].Result()
		if err != nil {
			return nil, err
		}
		entries = append(entries, KeyEntry{Key: n.(string), Type: typ, TTL: ttlSeconds(ttl)})
	}
	return entries, nil
}

// rankPage admits up to limit items from a stateless list-style fetch using a
// limit+1 lookahead. Ranks advance by admitted items so a byte-shortened page
// never skips members and needs no stored remainder.
func rankPage(pos int64, fetched []any, limit int64, ctxTag string, itemBytes func(any) int64) (items []any, next string, hasMore bool, reason string, err error) {
	admitted, _, reason, err := pageItems(fetched, limit, engines.MaxPreviewResultBytes, itemBytes)
	if err != nil {
		return nil, "", false, "", err
	}
	hasMore = int64(len(fetched)) > int64(len(admitted))
	if hasMore {
		next = mustCursor(browseCursor{Kind: cursorKindRank, Pos: pos + int64(len(admitted)), Ctx: ctxTag})
	}
	return admitted, next, hasMore, reason, nil
}

func memberBytes(it any) int64 { return jsonEncodedBytes(it.(string)) + 16 }

func hashPairBytes(it any) int64 {
	return jsonEncodedBytes(it.(hashPair)) + 32
}

func zsetMemberBytes(it any) int64 {
	return jsonEncodedBytes(it.(zsetMember)) + 32
}

// GetKeyPage returns one bounded page of a key's value. Strings move in
// labelled lossless byte windows; collections page by rank or bounded scan
// continuations. The key's current TYPE is re-read every request so a
// type change invalidates an outstanding continuation.
func (a *Adapter) GetKeyPage(ctx context.Context, in RedisValuePageInput) (*RedisValuePage, error) {
	start := time.Now()
	if in.Limit < 0 {
		return nil, errors.New("limit must be positive")
	}
	limit := in.Limit
	if limit == 0 {
		limit = defaultScanCount
	}
	if limit > maxScanCount {
		limit = maxScanCount
	}
	typ, err := a.client.Type(ctx, in.Key).Result()
	if err != nil {
		return nil, err
	}
	if typ == "none" {
		return nil, errors.New("key no longer exists or changed; refresh the key list")
	}
	ttl, err := a.client.TTL(ctx, in.Key).Result()
	if err != nil {
		return nil, err
	}
	ctxTag := cursorCtx(in.Scope, in.Key, typ)
	page := &RedisValuePage{Key: in.Key, Type: typ, TTL: ttlSeconds(ttl)}

	var c browseCursor
	if in.Cursor != "" {
		c, err = decodeBrowseCursor(in.Cursor)
		if err != nil {
			return nil, err
		}
		if c.Ctx != ctxTag {
			return nil, errCursorMismatch
		}
	}
	finish := func() *RedisValuePage {
		page.DurationMs = time.Since(start).Milliseconds()
		return page
	}

	switch typ {
	case "string":
		var pos int64
		if in.Cursor != "" {
			if c.Kind != cursorKindRank {
				return nil, errCursorMismatch
			}
			pos = c.Pos
		}
		total, err := a.client.StrLen(ctx, in.Key).Result()
		if err != nil {
			return nil, err
		}
		if pos < 0 || pos > total {
			return nil, errCursorMismatch
		}
		end := pos + stringWindowBytes
		if end > total {
			end = total
		}
		data := ""
		if end > pos {
			data, err = a.client.GetRange(ctx, in.Key, pos, end-1).Result()
			if err != nil {
				return nil, err
			}
		}
		encoding := "utf8"
		if !utf8.ValidString(data) {
			encoding = "base64"
			data = base64.StdEncoding.EncodeToString([]byte(data))
		}
		page.Value = &stringWindow{Data: data, Encoding: encoding, Start: pos, End: end, Total: total}
		page.HasMore = end < total
		page.Complete = pos == 0 && !page.HasMore
		page.PayloadBytes = jsonEncodedBytes(data) + 96
		if page.HasMore {
			page.NextCursor = mustCursor(browseCursor{Kind: cursorKindRank, Pos: end, Ctx: ctxTag})
		}
		return finish(), nil
	case "list":
		var pos int64
		if in.Cursor != "" {
			if c.Kind != cursorKindRank || c.Pos < 0 {
				return nil, errCursorMismatch
			}
			pos = c.Pos
		}
		members, err := a.client.LRange(ctx, in.Key, pos, pos+limit).Result()
		if err != nil {
			return nil, err
		}
		fetched := make([]any, len(members))
		var bytes int64 = 2
		for i, m := range members {
			fetched[i] = m
		}
		items, next, hasMore, reason, err := rankPage(pos, fetched, limit, ctxTag, memberBytes)
		if err != nil {
			return nil, err
		}
		out := make([]string, len(items))
		for i, it := range items {
			out[i] = it.(string)
			bytes += memberBytes(it) + 1
		}
		page.Value = out
		page.HasMore = hasMore
		page.NextCursor = next
		page.LimitReason = reason
		page.Complete = pos == 0 && !hasMore
		page.PayloadBytes = bytes
		return finish(), nil
	case "zset":
		var pos int64
		if in.Cursor != "" {
			if c.Kind != cursorKindRank || c.Pos < 0 {
				return nil, errCursorMismatch
			}
			pos = c.Pos
		}
		members, err := a.client.ZRangeWithScores(ctx, in.Key, pos, pos+limit).Result()
		if err != nil {
			return nil, err
		}
		fetched := make([]any, len(members))
		var bytes int64 = 2
		for i, m := range members {
			entry := zsetMember{Member: fmt.Sprint(m.Member), Score: m.Score}
			// ±Inf/NaN scores have no JSON form; carry the exact text so the
			// marshal boundary never fails or silently rewrites the score.
			if math.IsInf(m.Score, 0) || math.IsNaN(m.Score) {
				entry.Score = 0
				entry.ScoreText = strconv.FormatFloat(m.Score, 'g', -1, 64)
			}
			fetched[i] = entry
		}
		items, next, hasMore, reason, err := rankPage(pos, fetched, limit, ctxTag, zsetMemberBytes)
		if err != nil {
			return nil, err
		}
		out := make([]zsetMember, len(items))
		for i, it := range items {
			out[i] = it.(zsetMember)
			bytes += zsetMemberBytes(it) + 1
		}
		page.Value = out
		page.HasMore = hasMore
		page.NextCursor = next
		page.LimitReason = reason
		page.Complete = pos == 0 && !hasMore
		page.PayloadBytes = bytes
		return finish(), nil
	case "hash":
		items, next, done, reason, err := a.pageCollectionScan(ctx, in.Scope, in.Key, typ, "hash", limit, c,
			func(native uint64) ([]any, uint64, error) {
				vals, n, err := a.client.HScan(ctx, in.Key, native, "*", limit).Result()
				if err != nil {
					return nil, 0, err
				}
				items := make([]any, 0, len(vals)/2+1)
				for i := 0; i+1 < len(vals); i += 2 {
					items = append(items, hashPair{Field: vals[i], Value: vals[i+1]})
				}
				return items, n, nil
			},
			hashPairBytes,
		)
		if err != nil {
			return nil, err
		}
		var bytes int64 = 2
		for _, it := range items {
			bytes += hashPairBytes(it) + 1
		}
		page.Value = items
		page.HasMore = !done
		page.NextCursor = next
		page.LimitReason = reason
		page.Complete = in.Cursor == "" && done
		page.PayloadBytes = bytes
		return finish(), nil
	case "set":
		items, next, done, reason, err := a.pageCollectionScan(ctx, in.Scope, in.Key, typ, "set", limit, c,
			func(native uint64) ([]any, uint64, error) {
				vals, n, err := a.client.SScan(ctx, in.Key, native, "*", limit).Result()
				if err != nil {
					return nil, 0, err
				}
				items := make([]any, len(vals))
				for i, m := range vals {
					items[i] = m
				}
				return items, n, nil
			},
			memberBytes,
		)
		if err != nil {
			return nil, err
		}
		var bytes int64 = 2
		out := make([]string, len(items))
		for i, it := range items {
			out[i] = it.(string)
			bytes += memberBytes(it) + 1
		}
		page.Value = out
		page.HasMore = !done
		page.NextCursor = next
		page.LimitReason = reason
		page.Complete = in.Cursor == "" && done
		page.PayloadBytes = bytes
		return finish(), nil
	default:
		return nil, fmt.Errorf("paged inspector does not support %q values", typ)
	}
}

// ReleaseCursor drops the remainder session a lease cursor references.
// Malformed and non-lease cursors are harmless no-ops.
func (a *Adapter) ReleaseCursor(cursor string) bool {
	c, err := decodeBrowseCursor(cursor)
	if err != nil || c.Kind != cursorKindLease {
		return false
	}
	return a.sessions.release(c.Lease)
}

// ttlSeconds converts the driver's Duration to ioredis semantics: -1
// (no expiry) and -2 (missing key) pass through, positive values → seconds.
func ttlSeconds(d time.Duration) int64 {
	if d <= 0 {
		return int64(d)
	}
	return int64(d / time.Second)
}

// getKeyDetails mirrors the TS per-type fetch + optional MEMORY USAGE.
func (a *Adapter) getKeyDetails(ctx context.Context, key string) (string, any, int64, error) {
	typ, err := a.client.Type(ctx, key).Result()
	if err != nil {
		return "", nil, 0, err
	}
	ttl, err := a.client.TTL(ctx, key).Result()
	if err != nil {
		return "", nil, 0, err
	}
	var value any
	switch typ {
	case "string":
		v, err := a.client.Get(ctx, key).Result()
		if err == goredis.Nil {
			v = ""
		} else if err != nil {
			return "", nil, 0, err
		}
		value = v
	case "list":
		value, err = a.client.LRange(ctx, key, 0, -1).Result()
	case "set":
		value, err = a.client.SMembers(ctx, key).Result()
	case "zset":
		value, err = a.client.ZRangeWithScores(ctx, key, 0, -1).Result()
	case "hash":
		value, err = a.client.HGetAll(ctx, key).Result()
	}
	if err != nil {
		return "", nil, 0, err
	}
	return typ, value, ttlSeconds(ttl), nil
}

func (a *Adapter) GetKey(ctx context.Context, key string) (*RedisValue, error) {
	typ, value, ttl, err := a.getKeyDetails(ctx, key)
	if err != nil {
		return nil, err
	}
	// A legacy detail read is all-or-nothing: report the bound instead of
	// presenting a silently clipped value as the original.
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("value is not JSON-serializable: %w", err)
	}
	if int64(len(encoded)) > engines.MaxPreviewResultBytes {
		return nil, fmt.Errorf("value exceeds the %d-byte browse limit; open the paged inspector instead", engines.MaxPreviewResultBytes)
	}
	return &RedisValue{Key: key, Type: typ, TTL: ttl, Value: value}, nil
}

func (a *Adapter) GetTTL(ctx context.Context, key string) (int64, error) {
	ttl, err := a.client.TTL(ctx, key).Result()
	return ttlSeconds(ttl), err
}

var keyspaceLine = regexp.MustCompile(`^db(\d+):keys=(\d+),expires=(\d+),avg_ttl=(\d+)`)

// parseInfoSection returns the "key:value" lines under one "# Section" header of
// INFO output. RE2 has no lookahead, so the block is found by scanning lines: a
// "# " line starts a new section and only the requested one is collected. An
// exact header match keeps "Stats" from also reading "Commandstats".
func parseInfoSection(info, section string) map[string]string {
	out := map[string]string{}
	inSection := false
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)
		if name, isHeader := strings.CutPrefix(line, "# "); isHeader {
			inSection = name == section
			continue
		}
		if !inSection {
			continue
		}
		key, val, found := strings.Cut(line, ":")
		if found && key != "" {
			out[strings.TrimSpace(key)] = strings.TrimSpace(val)
		}
	}
	return out
}

func atoi(s string) int64 {
	n, _ := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	return n
}

func (a *Adapter) GetStats(ctx context.Context) (*RedisStats, error) {
	info, err := a.client.Info(ctx, "all").Result()
	if err != nil {
		return nil, err
	}
	server := parseInfoSection(info, "Server")
	clients := parseInfoSection(info, "Clients")
	memory := parseInfoSection(info, "Memory")
	stats := parseInfoSection(info, "Stats")

	var totalKeys, totalExpiring, avgTTL int64
	for _, line := range strings.Split(info, "\n") {
		if km := keyspaceLine.FindStringSubmatch(strings.TrimSpace(line)); len(km) == 5 {
			if atoi(km[1]) == int64(a.cfg.Database) {
				totalKeys += atoi(km[2])
				totalExpiring += atoi(km[3])
				if v := atoi(km[4]); v != 0 {
					avgTTL = v
				}
			}
		}
	}

	version := server["redis_version"]
	if version == "" {
		version = "unknown"
	}
	out := &RedisStats{
		Version:          version,
		ConnectedClients: atoi(clients["connected_clients"]),
		BlockedClients:   atoi(clients["blocked_clients"]),
		TotalConnections: atoi(stats["total_connections_received"]),
		TotalCommands:    atoi(stats["total_commands_processed"]),
		UsedMemory:       atoi(memory["used_memory"]),
		UsedMemoryPeak:   atoi(memory["used_memory_peak"]),
		TotalKeys:        totalKeys,
		ExpiringKeys:     totalExpiring,
		AvgTTL:           avgTTL,
		UptimeSeconds:    atoi(server["uptime_in_seconds"]),
	}
	if mm := memory["maxmemory"]; mm != "" {
		v := atoi(mm)
		out.MaxMemory = &v
	}
	if stats["keyspace_hits"] != "" && stats["keyspace_misses"] != "" {
		hits, misses := atoi(stats["keyspace_hits"]), atoi(stats["keyspace_misses"])
		if total := hits + misses; total > 0 {
			rate := float64(hits) / float64(total) * 100
			out.HitRate = &rate
		} else {
			zero := float64(0)
			out.HitRate = &zero
		}
	}
	return out, nil
}

var commandTokenizer = regexp.MustCompile(`(?:[^\s"']+|"[^"]*"|'[^']*')+`)

// RunCommand ports runCommand — same shell-ish tokenizer, then a raw call.
func (a *Adapter) RunCommand(ctx context.Context, command string) (*CommandResult, error) {
	trimmed := strings.TrimSpace(command)
	parts := commandTokenizer.FindAllString(trimmed, -1)
	if len(parts) == 0 {
		return nil, errors.New("Empty command")
	}
	args := make([]any, 0, len(parts)-1)
	strip := regexp.MustCompile(`^["']|["']$`)
	for _, p := range parts[1:] {
		args = append(args, strip.ReplaceAllString(p, ""))
	}
	start := time.Now()
	result, err := a.client.Do(ctx, append([]any{parts[0]}, args...)...).Result()
	if err != nil && err != goredis.Nil {
		return nil, err
	}
	out := &CommandResult{Result: result, Command: trimmed, DurationMs: time.Since(start).Milliseconds()}
	// The command already ran; an oversized reply is reported, never clipped
	// into something it was not and never replayed to fit.
	encoded, merr := json.Marshal(out)
	if merr != nil {
		return nil, fmt.Errorf("command response is not JSON-serializable: %w", merr)
	}
	if int64(len(encoded)) > engines.MaxGUIResultBytes {
		return nil, fmt.Errorf("Redis command response exceeds the %d-byte limit; it may already have executed — do not replay it automatically", engines.MaxGUIResultBytes)
	}
	return out, nil
}

func (a *Adapter) Close() error {
	a.sessions.releaseAll()
	return a.client.Close()
}

// TestRedisConnection mirrors testRedisConnection: ephemeral client, no
// retries, 3s dial timeout so a down Redis fails fast.
func TestRedisConnection(ctx context.Context, cfg Config) (*TestConnectionResult, error) {
	client := newClient(cfg, testConnectTimeout, true)
	defer client.Close()
	if err := client.Ping(ctx).Err(); err != nil {
		return &TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	return &TestConnectionResult{Success: true, ServerVersion: "Redis"}, nil
}
