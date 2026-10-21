package mongo

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Raw commands may write. The native driver's newer adaptive retry path
// exists even when ordinary RunCommand retry mode is unset; URI cannot enable it.
func TestRawMongoCommandsDisableAdaptiveReplay(t *testing.T) {
	for _, uri := range []string{
		"mongodb://localhost/private",
		"mongodb://localhost/private?retryReads=true&retryWrites=true&maxAdaptiveRetries=5",
	} {
		opts := clientOptions(Config{ConnectionString: uri})
		if err := opts.Validate(); err != nil {
			t.Fatal(err)
		}
		if opts.MaxAdaptiveRetries == nil || *opts.MaxAdaptiveRetries != disabledAdaptiveRetries {
			t.Fatal("raw command can be replayed", opts.MaxAdaptiveRetries)
		}
	}
}

func TestNormalizeConnectionString(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"mongodb://localhost:27017", "mongodb://127.0.0.1:27017"},
		{"mongodb://user:pass@localhost:27017/db", "mongodb://user:pass@127.0.0.1:27017/db"},
		{"mongodb://localhost/test", "mongodb://127.0.0.1/test"},
		{"mongodb://localhost", "mongodb://127.0.0.1"},
		{"mongodb://localhost?authSource=admin", "mongodb://127.0.0.1?authSource=admin"},
		{"mongodb://127.0.0.1:27017", "mongodb://127.0.0.1:27017"},
		{"mongodb://remote-host.com:27017", "mongodb://remote-host.com:27017"},
	}
	for _, tc := range cases {
		got := normalizeConnectionString(tc.input)
		if got != tc.want {
			t.Errorf("normalizeConnectionString(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestSanitizeFilterNormalizesID(t *testing.T) {
	hexID := "661ef4b823e5a1b2c3d4e5f6"
	sanitized := sanitizeFilter(map[string]any{"_id": hexID})
	inMap, ok := sanitized["_id"].(bson.M)
	if !ok {
		t.Fatalf("expected bson.M for _id, got %T", sanitized["_id"])
	}
	inList, ok := inMap["$in"].([]any)
	if !ok || len(inList) != 2 {
		t.Fatalf("expected $in list of length 2, got %v", inMap["$in"])
	}
	if inList[1] != hexID {
		t.Fatalf("expected raw hex %q, got %v", hexID, inList[1])
	}

	// Non-hex string preserved as literal string
	nonHex := "not_a_hex_id"
	sanitizedNonHex := sanitizeFilter(map[string]any{"_id": nonHex})
	if sanitizedNonHex["_id"] != nonHex {
		t.Fatalf("expected non-hex preserved, got %v", sanitizedNonHex["_id"])
	}
}
