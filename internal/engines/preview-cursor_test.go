package engines

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestPreviewCursorLosslessAndContextBound(t *testing.T) {
	limit := int64(50)
	key := ColumnInfo{Name: "id", Type: "bigint", PrimaryKey: true}
	input := PreviewRowsInput{TableID: "public.users", Limit: &limit, SortColumn: "id", SortDirection: "desc", Search: "needle"}
	value := int64(9007199254740993)
	cursor, err := EncodePreviewCursor(input, key, value)
	if err != nil {
		t.Fatal(err)
	}
	input.Cursor = cursor
	got, err := DecodePreviewCursor(input, key)
	if err != nil || got != value {
		t.Fatalf("got %v, %v", got, err)
	}
	offset := int64(500)
	input.Offset = &offset
	if _, err := DecodePreviewCursor(input, key); err != nil {
		t.Fatal("display offset broke cursor", err)
	}
	for _, change := range []func(*PreviewRowsInput){
		func(i *PreviewRowsInput) { i.TableID = "other" },
		func(i *PreviewRowsInput) { i.Schema = "other" },
		func(i *PreviewRowsInput) { i.SortDirection = "asc" },
		func(i *PreviewRowsInput) { i.SortColumn = "other" },
		func(i *PreviewRowsInput) { i.Search = "different" },
		func(i *PreviewRowsInput) { i.SearchColumn = "name" },
		func(i *PreviewRowsInput) { i.MatchCase = true },
		func(i *PreviewRowsInput) { n := int64(100); i.Limit = &n },
		func(i *PreviewRowsInput) { i.Filters = []PreviewFilter{{Column: "name", Value: "other"}} },
	} {
		changed := input
		change(&changed)
		if _, err := DecodePreviewCursor(changed, key); !errors.Is(err, ErrPreviewCursor) {
			t.Fatal("stale cursor accepted", err)
		}
	}
}

// Same-named tables on another connection/engine cannot reuse an anchor.
// Scope is adapter-owned and omitted from JSON, not an authority supplied by UI.
func TestPreviewCursorAdapterScope(t *testing.T) {
	key := ColumnInfo{Name: "id", Type: "bigint", PrimaryKey: true}
	scope := NewPreviewScope(KindPostgres)
	input := ScopePreview(PreviewRowsInput{TableID: "public.fixture"}, scope)
	cursor, err := EncodePreviewCursor(input, key, int64(42))
	if err != nil {
		t.Fatal(err)
	}
	input.Cursor = cursor
	for _, other := range []string{"", NewPreviewScope(KindPostgres), NewPreviewScope(KindSQLite)} {
		if _, err := DecodePreviewCursor(ScopePreview(input, other), key); !errors.Is(err, ErrPreviewCursor) {
			t.Fatal("cross-scope cursor accepted", err)
		}
	}
	data, err := json.Marshal(input)
	if err != nil || strings.Contains(string(data), scope) {
		t.Fatal("internal scope reached JSON", string(data), err)
	}
	var clientInput PreviewRowsInput
	if err := json.Unmarshal([]byte(`{"tableId":"public.fixture","previewScope":"client"}`), &clientInput); err != nil {
		t.Fatal(err)
	}
	if clientInput.previewScope != "" {
		t.Fatal("client supplied internal scope")
	}
}

func TestPreviewCursorRejectsMalformedAndOversized(t *testing.T) {
	key := ColumnInfo{Name: "id", Type: "integer", PrimaryKey: true}
	input := PreviewRowsInput{TableID: "users"}
	valid, err := EncodePreviewCursor(input, key, int64(42))
	if err != nil {
		t.Fatal(err)
	}
	decoded, _ := base64.RawURLEncoding.DecodeString(valid)
	var cursor previewCursor
	if err := json.Unmarshal(decoded, &cursor); err != nil {
		t.Fatal(err)
	}
	cursor.Version++
	wrongVersion, _ := json.Marshal(cursor)
	for _, token := range []string{"bad token", strings.Repeat("x", MaxPreviewCursorBytes+1), base64.RawURLEncoding.EncodeToString(wrongVersion), base64.RawURLEncoding.EncodeToString(append(decoded, []byte("{}")...))} {
		input.Cursor = token
		if _, err := DecodePreviewCursor(input, key); !errors.Is(err, ErrPreviewCursor) {
			t.Fatal("invalid token accepted", err)
		}
	}
	key.Type = "text"
	if _, err := EncodePreviewCursor(input, key, strings.Repeat("x", MaxPreviewCursorBytes)); !errors.Is(err, ErrPreviewCursor) {
		t.Fatal("oversized key accepted", err)
	}
}

func TestPreviewEligibilityAndExplicitFallback(t *testing.T) {
	key := ColumnInfo{Name: "id", Type: "integer", PrimaryKey: true}
	for _, columns := range [][]ColumnInfo{nil, {{Name: "id", Type: "integer"}}, {{Name: "id", Type: "integer", PrimaryKey: true, Nullable: true}}, {key, {Name: "other", Type: "text", PrimaryKey: true}}, {{Name: "id", Type: "numeric", PrimaryKey: true}}} {
		if PreviewPrimaryKey(KindPostgres, columns) != nil {
			t.Fatal("unsupported key accepted")
		}
	}
	if PreviewPrimaryKey(KindPostgres, []ColumnInfo{key}) == nil {
		t.Fatal("integer PK rejected")
	}
	for _, input := range []PreviewRowsInput{{SortColumn: "name"}, {PaginationMode: PaginationOffset}} {
		seek, err := UsePreviewCursor(input, &key, 0)
		if err != nil || seek {
			t.Fatal("expected offset fallback", seek, err)
		}
		input.Cursor = "bookmark"
		if _, err := UsePreviewCursor(input, &key, 0); !errors.Is(err, ErrPreviewCursor) {
			t.Fatal("mismatched cursor silently fell back")
		}
	}
	if seek, err := UsePreviewCursor(PreviewRowsInput{}, &key, 50); err != nil || seek {
		t.Fatal("legacy direct offset ignored")
	}
}
