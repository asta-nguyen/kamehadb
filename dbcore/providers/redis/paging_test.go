package redis

import (
	"context"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Live tests reuse the private-server convention: they skip unless the opt-in
// address is set, so the suite stays hermetic on machines without Redis.
func pagingAdapter(t *testing.T) *Adapter {
	t.Helper()
	addr := os.Getenv("KAMEHADB_TEST_REDIS_ADDR")
	if addr == "" {
		t.Skip("KAMEHADB_TEST_REDIS_ADDR not set")
	}
	host, portString, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.ParseInt(portString, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	adapter := New(Config{Host: host, Port: port})
	t.Cleanup(func() { adapter.Close() })
	return adapter
}

func flushKeys(t *testing.T, a *Adapter, prefix string) {
	t.Helper()
	ctx := context.Background()
	keys, err := a.client.Keys(ctx, prefix+"*").Result()
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) > 0 {
		if err := a.client.Del(ctx, keys...).Err(); err != nil {
			t.Fatal(err)
		}
	}
}

func TestScanKeysOpaqueStringCursor(t *testing.T) {
	a := pagingAdapter(t)
	ctx := context.Background()
	prefix := "kameha-paging-scan-"
	flushKeys(t, a, prefix)
	for i := 0; i < 5; i++ {
		if err := a.client.Set(ctx, fmt.Sprintf("%s%d", prefix, i), "v", 0).Err(); err != nil {
			t.Fatal(err)
		}
	}
	defer flushKeys(t, a, prefix)

	first, err := a.ScanKeys(ctx, ScanKeysInput{Pattern: prefix + "*", Count: 3, Scope: "conn"})
	if err != nil {
		t.Fatal(err)
	}
	if first.Done {
		t.Fatal("expected more pages")
	}
	if first.NextCursor == "" {
		t.Fatal("missing continuation")
	}
	// Cursors are opaque strings — never a JS-unsafe number.
	if _, err := strconv.ParseInt(first.NextCursor, 10, 64); err == nil && len(first.NextCursor) < 20 {
		t.Fatalf("cursor must be opaque, got bare number %q", first.NextCursor)
	}
	second, err := a.ScanKeys(ctx, ScanKeysInput{Pattern: prefix + "*", Count: 3, Cursor: first.NextCursor, Scope: "conn"})
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, e := range append(first.Keys, second.Keys...) {
		seen[e.Key] = true
	}
	for i := 0; i < 5; i++ {
		if !seen[fmt.Sprintf("%s%d", prefix, i)] {
			t.Fatalf("missing key %d across pages; seen %v", i, seen)
		}
	}
}

func TestScanKeysRemainderPreservesKeys(t *testing.T) {
	a := pagingAdapter(t)
	ctx := context.Background()
	// Key names near 450KB overflow the 2 MiB page budget: the native batch
	// returns all six but only some are admitted; the rest park in a remainder.
	longPrefix := "kameha-paging-long-"
	flushKeys(t, a, longPrefix)
	for i := 0; i < 6; i++ {
		name := longPrefix + strings.Repeat("k", 450<<10) + fmt.Sprintf("-%d", i)
		if err := a.client.Set(ctx, name, "v", 0).Err(); err != nil {
			t.Fatal(err)
		}
	}
	defer flushKeys(t, a, longPrefix)

	page, err := a.ScanKeys(ctx, ScanKeysInput{Pattern: longPrefix + "*", Count: 100, Scope: "conn"})
	if err != nil {
		t.Fatal(err)
	}
	if page.LimitReason != "bytes" || page.Done || len(page.Keys) >= 6 {
		t.Fatalf("expected byte-limited page, got reason %q done=%v keys=%d", page.LimitReason, page.Done, len(page.Keys))
	}
	// Drain the remainder through lease cursors until the native scan resumes.
	seen := len(page.Keys)
	cursor := page.NextCursor
	for i := 0; i < 10 && !page.Done; i++ {
		page, err = a.ScanKeys(ctx, ScanKeysInput{Pattern: longPrefix + "*", Count: 100, Cursor: cursor, Scope: "conn"})
		if err != nil {
			t.Fatal(err)
		}
		seen += len(page.Keys)
		cursor = page.NextCursor
	}
	if seen != 6 {
		t.Fatalf("byte-shortened pages dropped keys: saw %d of 6", seen)
	}
}

func TestScanKeysRejectsForeignCursor(t *testing.T) {
	a := pagingAdapter(t)
	ctx := context.Background()
	prefix := "kameha-paging-scope-"
	flushKeys(t, a, prefix)
	if err := a.client.Set(ctx, prefix+"a", "v", 0).Err(); err != nil {
		t.Fatal(err)
	}
	defer flushKeys(t, a, prefix)
	for i := 0; i < 200; i++ {
		if err := a.client.Set(ctx, fmt.Sprintf("%sk%d", prefix, i), "v", 0).Err(); err != nil {
			t.Fatal(err)
		}
	}
	first, err := a.ScanKeys(ctx, ScanKeysInput{Pattern: prefix + "k*", Count: 5, Scope: "conn"})
	if err != nil {
		t.Fatal(err)
	}
	if first.Done {
		t.Skip("scan finished in one page; nothing to mismatch")
	}
	if _, err := a.ScanKeys(ctx, ScanKeysInput{Pattern: "other-*", Count: 5, Cursor: first.NextCursor, Scope: "conn"}); err == nil {
		t.Fatal("cursor bound to one pattern must not page another")
	}
	if _, err := a.ScanKeys(ctx, ScanKeysInput{Pattern: prefix + "k*", Count: 5, Cursor: first.NextCursor, Scope: "other"}); err == nil {
		t.Fatal("cursor bound to one connection must not page another")
	}
	if _, err := a.ScanKeys(ctx, ScanKeysInput{Pattern: prefix + "k*", Count: 5, Cursor: "garbage", Scope: "conn"}); err == nil {
		t.Fatal("malformed cursor must fail loudly")
	}
}

func TestGetKeyPageStringWindows(t *testing.T) {
	a := pagingAdapter(t)
	ctx := context.Background()
	key := "kameha-paging-str"
	defer a.client.Del(ctx, key)
	value := strings.Repeat("abc123 ", 20000) // ~140KB > one 64KiB window
	if err := a.client.Set(ctx, key, value, 0).Err(); err != nil {
		t.Fatal(err)
	}
	first, err := a.GetKeyPage(ctx, RedisValuePageInput{Key: key, Scope: "conn"})
	if err != nil {
		t.Fatal(err)
	}
	if first.Complete || !first.HasMore {
		t.Fatal("large string must page, not claim completeness")
	}
	w, ok := first.Value.(*stringWindow)
	if !ok {
		t.Fatalf("expected string window, got %T", first.Value)
	}
	if w.Start != 0 || w.End != stringWindowBytes || w.Total != int64(len(value)) {
		t.Fatalf("bad window %+v", w)
	}
	second, err := a.GetKeyPage(ctx, RedisValuePageInput{Key: key, Cursor: first.NextCursor, Scope: "conn"})
	if err != nil {
		t.Fatal(err)
	}
	w2 := second.Value.(*stringWindow)
	if w2.Start != stringWindowBytes {
		t.Fatalf("window did not advance to %d, got %d", stringWindowBytes, w2.Start)
	}
	// Windows after the first are never "complete" views of the original.
	if second.Complete {
		t.Fatal("a later window must not claim completeness")
	}
	if second.HasMore {
		third, err := a.GetKeyPage(ctx, RedisValuePageInput{Key: key, Cursor: second.NextCursor, Scope: "conn"})
		if err != nil {
			t.Fatal(err)
		}
		if third.HasMore {
			t.Fatal("140KB should fit in three 64KiB windows")
		}
	}
}

func TestGetKeyPageBinaryStringIsBase64(t *testing.T) {
	a := pagingAdapter(t)
	ctx := context.Background()
	key := "kameha-paging-bin"
	defer a.client.Del(ctx, key)
	// 0xFF is never valid UTF-8; the window must stay lossless via base64.
	if err := a.client.Set(ctx, key, string([]byte{0xff, 0xfe, 0x00, 0x01})+strings.Repeat("\xff", 100), 0).Err(); err != nil {
		t.Fatal(err)
	}
	page, err := a.GetKeyPage(ctx, RedisValuePageInput{Key: key, Scope: "conn"})
	if err != nil {
		t.Fatal(err)
	}
	w := page.Value.(*stringWindow)
	if w.Encoding != "base64" {
		t.Fatalf("binary window must be base64, got %q", w.Encoding)
	}
	if !page.Complete {
		t.Fatal("small binary value should fit one window")
	}
}

func TestGetKeyPageListRankContinuation(t *testing.T) {
	a := pagingAdapter(t)
	ctx := context.Background()
	key := "kameha-paging-list"
	defer a.client.Del(ctx, key)
	for i := 0; i < 250; i++ {
		if err := a.client.RPush(ctx, key, fmt.Sprintf("m%d", i)).Err(); err != nil {
			t.Fatal(err)
		}
	}
	first, err := a.GetKeyPage(ctx, RedisValuePageInput{Key: key, Limit: 100, Scope: "conn"})
	if err != nil {
		t.Fatal(err)
	}
	members := first.Value.([]string)
	if len(members) != 100 || !first.HasMore || first.Complete {
		t.Fatalf("expected 100 members with more, got %d complete=%v", len(members), first.Complete)
	}
	second, err := a.GetKeyPage(ctx, RedisValuePageInput{Key: key, Limit: 100, Cursor: first.NextCursor, Scope: "conn"})
	if err != nil {
		t.Fatal(err)
	}
	m2 := second.Value.([]string)
	if m2[0] != "m100" {
		t.Fatalf("rank continuation must advance by admitted items, got %q", m2[0])
	}
	third, err := a.GetKeyPage(ctx, RedisValuePageInput{Key: key, Limit: 100, Cursor: second.NextCursor, Scope: "conn"})
	if err != nil {
		t.Fatal(err)
	}
	if len(third.Value.([]string)) != 50 || third.HasMore {
		t.Fatal("expected final 50 members")
	}
}

func TestGetKeyPageHashSetRemainder(t *testing.T) {
	a := pagingAdapter(t)
	ctx := context.Background()
	key := "kameha-paging-hash"
	defer a.client.Del(ctx, key)
	pairs := make([]any, 0, 600)
	for i := 0; i < 300; i++ {
		pairs = append(pairs, fmt.Sprintf("f%04d", i), strings.Repeat("v", 8<<10))
	}
	if err := a.client.HSet(ctx, key, pairs...).Err(); err != nil {
		t.Fatal(err)
	}
	// 8KB values admit well under a page; overflow goes through a lease.
	first, err := a.GetKeyPage(ctx, RedisValuePageInput{Key: key, Limit: 1000, Scope: "conn"})
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, p := range first.Value.([]any) {
		hp := p.(hashPair)
		got[hp.Field] = hp.Value
	}
	cursor := first.NextCursor
	page := first
	for i := 0; i < 40 && page.HasMore; i++ {
		page, err = a.GetKeyPage(ctx, RedisValuePageInput{Key: key, Limit: 1000, Cursor: cursor, Scope: "conn"})
		if err != nil {
			t.Fatal(err)
		}
		for _, p := range page.Value.([]any) {
			hp := p.(hashPair)
			got[hp.Field] = hp.Value
		}
		cursor = page.NextCursor
	}
	if len(got) != 300 {
		t.Fatalf("hash paging lost members: got %d of 300", len(got))
	}
	for i := 0; i < 300; i++ {
		if _, ok := got[fmt.Sprintf("f%04d", i)]; !ok {
			t.Fatalf("missing field f%04d", i)
		}
	}
}

func TestGetKeyPageDeletedKeyInvalidates(t *testing.T) {
	a := pagingAdapter(t)
	ctx := context.Background()
	key := "kameha-paging-gone"
	for i := 0; i < 200; i++ {
		if err := a.client.RPush(ctx, key, fmt.Sprintf("m%d", i)).Err(); err != nil {
			t.Fatal(err)
		}
	}
	first, err := a.GetKeyPage(ctx, RedisValuePageInput{Key: key, Limit: 50, Scope: "conn"})
	if err != nil {
		t.Fatal(err)
	}
	if err := a.client.Del(ctx, key).Err(); err != nil {
		t.Fatal(err)
	}
	if _, err := a.GetKeyPage(ctx, RedisValuePageInput{Key: key, Limit: 50, Cursor: first.NextCursor, Scope: "conn"}); err == nil {
		t.Fatal("deleted key must fail with a restart-style error")
	}
}

func TestReleaseCursorThenResumeFails(t *testing.T) {
	a := pagingAdapter(t)
	// Seed a session directly — reaching one through a native overflow in a
	// unit test would need a >2MiB member.
	sess, err := a.sessions.put("conn", "k", "set", []any{"a", "b"}, 0, memberBytes)
	if err != nil {
		t.Fatal(err)
	}
	id := a.sessions.leaseID(sess)
	cursor := mustCursor(browseCursor{Kind: cursorKindLease, Lease: id, Pos: 0, Ctx: cursorCtx("conn", "k", "set")})
	if !a.ReleaseCursor(cursor) {
		t.Fatal("release should drop the session")
	}
	if a.ReleaseCursor(cursor) {
		t.Fatal("double release must report false")
	}
	// Drained lease cursors now fail expired.
	if _, ok := a.sessions.find(id); ok {
		t.Fatal("session should be gone")
	}
}

func TestScanSessionBudgetAndExpiry(t *testing.T) {
	ss := newScanSessions()
	mk := func(n int) []any {
		items := make([]any, n)
		for i := range items {
			items[i] = fmt.Sprintf("f%d", i)
		}
		return items
	}
	// A single remainder above the per-session budget refuses storage.
	bigItems := []any{strings.Repeat("x", scanSessionMaxBytes+1)}
	if _, err := ss.put("c", "k", "set", bigItems, 0, func(it any) int64 { return int64(len(it.(string))) }); err == nil {
		t.Fatal("remainder beyond the session budget must refuse")
	}
	// Session count is capped.
	for i := 0; i < scanSessionMaxCount; i++ {
		if _, err := ss.put("c", fmt.Sprintf("k%d", i), "set", mk(1), 0, memberBytes); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := ss.put("c", "extra", "set", mk(1), 0, memberBytes); err == nil {
		t.Fatal("session count cap must refuse")
	}
	// Expired sessions free their bytes on lookup.
	sess, _ := ss.put("c", "k", "set", mk(1), 0, memberBytes)
	_ = sess
	ss.mu.Lock()
	for _, s := range ss.items {
		s.expiresAt = time.Now().Add(-time.Second)
	}
	ss.mu.Unlock()
	if _, ok := ss.find("missing"); ok {
		t.Fatal("missing id must not resolve")
	}
}

func TestGetKeyOversizedSuggestsInspector(t *testing.T) {
	a := pagingAdapter(t)
	ctx := context.Background()
	key := "kameha-paging-huge"
	defer a.client.Del(ctx, key)
	if err := a.client.Set(ctx, key, strings.Repeat("z", 3<<20), 0).Err(); err != nil {
		t.Fatal(err)
	}
	_, err := a.GetKey(ctx, key)
	if err == nil || !strings.Contains(err.Error(), "paged inspector") {
		t.Fatalf("oversized legacy read must point at the paged inspector, got %v", err)
	}
}

func TestCloseClearsSessions(t *testing.T) {
	a := New(Config{Host: "127.0.0.1", Port: 1})
	if _, err := a.sessions.put("c", "k", "set", []any{"x"}, 0, memberBytes); err != nil {
		t.Fatal(err)
	}
	_ = a.Close()
	a.sessions.mu.Lock()
	defer a.sessions.mu.Unlock()
	if len(a.sessions.items) != 0 || a.sessions.bytes != 0 {
		t.Fatal("close must release all remainder sessions")
	}
}

// Set path exercises SSCAN through the shared remainder machinery. 32 KiB
// members make every returned batch exceed the 2 MiB page budget well before
// the 100-member row limit, so at least one page must spill into a lease;
// members then survive without drops or duplicates.
func TestGetKeyPageSetRemainder(t *testing.T) {
	a := pagingAdapter(t)
	ctx := context.Background()
	key := "kameha-paging-set"
	defer a.client.Del(ctx, key)
	members := make([]any, 300)
	for i := range members {
		members[i] = fmt.Sprintf("m%04d-%s", i, strings.Repeat("v", 32<<10))
	}
	if err := a.client.SAdd(ctx, key, members...).Err(); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	leaseUsed := false
	cursor := ""
	for i := 0; i < 60; i++ {
		page, err := a.GetKeyPage(ctx, RedisValuePageInput{Key: key, Cursor: cursor, Limit: 100})
		if err != nil {
			t.Fatal(err)
		}
		list, ok := page.Value.([]string)
		if !ok {
			t.Fatalf("set page must carry []string, got %T", page.Value)
		}
		for _, m := range list {
			if seen[m] {
				t.Fatalf("duplicate member across pages: %s", m[:8])
			}
			seen[m] = true
		}
		if !page.HasMore {
			break
		}
		if c, err := decodeBrowseCursor(page.NextCursor); err == nil && c.Kind == cursorKindLease {
			leaseUsed = true
		}
		cursor = page.NextCursor
		if cursor == "" {
			t.Fatal("hasMore without a continuation")
		}
	}
	if len(seen) != 300 {
		t.Fatalf("set paging dropped members: got %d of 300", len(seen))
	}
	if !leaseUsed {
		t.Fatal("byte-oversized SSCAN batches must route through a remainder lease")
	}
}
