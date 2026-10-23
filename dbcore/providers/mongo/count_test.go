package mongo

import (
	"context"
	"os"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

func TestValidatePaging(t *testing.T) {
	if err := validatePaging(0, 0); err != nil {
		t.Fatal(err)
	}
	if err := validatePaging(-1, 10); err == nil {
		t.Fatal("negative skip must be rejected")
	}
	if err := validatePaging(0, -5); err == nil {
		t.Fatal("negative limit must be rejected")
	}
}

func TestCountJSONValueLossless(t *testing.T) {
	if v := countJSONValue(42); v != int64(42) {
		t.Fatalf("small counts stay numeric, got %v", v)
	}
	if v := countJSONValue(maxJSONSafeInteger); v != int64(maxJSONSafeInteger) {
		t.Fatalf("boundary count stays numeric, got %v", v)
	}
	v := countJSONValue(maxJSONSafeInteger + 1)
	s, ok := v.(string)
	if !ok || s != "9007199254740992" {
		t.Fatalf("unsafe count must cross as decimal string, got %#v", v)
	}
}

// Counts against a live server exercise the real driver path: estimated only
// for unfiltered collections, exact honors the effective filter, and page
// reads never count implicitly.
func TestCountDocumentsLive(t *testing.T) {
	uri := os.Getenv("KAMEHADB_TEST_MONGO_URI")
	if uri == "" {
		t.Skip("KAMEHADB_TEST_MONGO_URI not set")
	}
	a, err := New(Config{ConnectionString: uri})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close(context.Background())
	db := a.client.Database("kameha_count_test")
	coll := db.Collection("items")
	defer func() { _ = db.Drop(context.Background()) }()
	docs := make([]any, 20)
	for i := range docs {
		docs[i] = bson.M{"n": i, "kind": map[bool]string{true: "even", false: "odd"}[i%2 == 0]}
	}
	if _, err := coll.InsertMany(context.Background(), docs); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	est, err := a.CountDocuments(ctx, CountDocumentsInput{Collection: "items", Database: "kameha_count_test", Mode: "estimated"})
	if err != nil {
		t.Fatal(err)
	}
	if est.Count != int64(20) || est.CountMode != "estimated" {
		t.Fatalf("estimated count got %v (%s)", est.Count, est.CountMode)
	}
	if _, err := a.CountDocuments(ctx, CountDocumentsInput{
		Collection: "items", Database: "kameha_count_test", Mode: "estimated",
		Filter: map[string]any{"kind": "even"},
	}); err == nil || !strings.Contains(err.Error(), "estimated") {
		t.Fatal("filtered estimate must be rejected, not silently converted")
	}
	exact, err := a.CountDocuments(ctx, CountDocumentsInput{
		Collection: "items", Database: "kameha_count_test", Mode: "exact",
		Filter: map[string]any{"kind": "even"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if exact.Count != int64(10) || exact.CountMode != "exact" {
		t.Fatalf("exact count got %v (%s)", exact.Count, exact.CountMode)
	}
	if _, err := a.CountDocuments(ctx, CountDocumentsInput{Collection: "items", Database: "kameha_count_test", Mode: "bogus"}); err == nil {
		t.Fatal("invalid mode must fail")
	}
	// Exact counts share the effective search/filter semantics of the browse path.
	search, err := a.CountDocuments(ctx, CountDocumentsInput{
		Collection: "items", Database: "kameha_count_test", Mode: "exact", Search: "even",
	})
	if err != nil {
		t.Fatal(err)
	}
	if search.Count != int64(10) {
		t.Fatalf("search count got %v", search.Count)
	}

	// Browse stays bounded and never counts: totalCount stays unset.
	page, err := a.FindDocuments(ctx, FindDocumentsInput{Collection: "items", Database: "kameha_count_test", Limit: 5})
	if err != nil {
		t.Fatal(err)
	}
	if page.TotalCount != nil {
		t.Fatal("browse must not perform a compulsory count")
	}
	if len(page.Documents) != 5 || !page.HasMore {
		t.Fatalf("expected 5 docs with hasMore, got %d hasMore=%v", len(page.Documents), page.HasMore)
	}
	if _, err := a.FindDocuments(ctx, FindDocumentsInput{Collection: "items", Database: "kameha_count_test", Skip: -1}); err == nil {
		t.Fatal("negative skip must fail")
	}
}

// A byte-bounded page admits fewer documents than the row limit; resuming at
// the admitted count must continue without gaps or duplicates — the frontend
// drives its next skip from documents.length for exactly this case.
func TestFindDocumentsByteBudgetLive(t *testing.T) {
	uri := os.Getenv("KAMEHADB_TEST_MONGO_URI")
	if uri == "" {
		t.Skip("KAMEHADB_TEST_MONGO_URI not set")
	}
	a, err := New(Config{ConnectionString: uri})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close(context.Background())
	db := a.client.Database("kameha_byte_page")
	coll := db.Collection("docs")
	defer func() { _ = db.Drop(context.Background()) }()
	docs := make([]any, 12)
	for i := range docs {
		docs[i] = bson.M{"n": i, "pad": strings.Repeat("x", 300<<10)}
	}
	if _, err := coll.InsertMany(context.Background(), docs); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	first, err := a.FindDocuments(ctx, FindDocumentsInput{
		Collection: "docs", Database: "kameha_byte_page", Limit: 10, Sort: map[string]int32{"n": 1},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Documents) >= 10 {
		t.Fatalf("byte budget should shorten the page, admitted %d", len(first.Documents))
	}
	if first.LimitReason != engines.LimitReasonBytes || !first.HasMore {
		t.Fatalf("expected bytes limit with hasMore, got %q hasMore=%v", first.LimitReason, first.HasMore)
	}
	second, err := a.FindDocuments(ctx, FindDocumentsInput{
		Collection: "docs", Database: "kameha_byte_page", Limit: 10,
		Skip: int64(len(first.Documents)), Sort: map[string]int32{"n": 1},
	})
	if err != nil {
		t.Fatal(err)
	}
	seen := map[int64]bool{}
	for _, doc := range append(first.Documents, second.Documents...) {
		n, ok := doc["n"].(int32)
		if !ok {
			t.Fatalf("doc n came back as %T", doc["n"])
		}
		if seen[int64(n)] {
			t.Fatalf("document repeated across pages: %v", n)
		}
		seen[int64(n)] = true
	}
	for i := 0; i < 12; i++ {
		if !seen[int64(i)] {
			t.Fatalf("document %d skipped across byte-bounded pages", i)
		}
	}
}
