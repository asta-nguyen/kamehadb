package mongo

import (
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// keysOf lists a document's keys in order.
func keysOf(doc bson.D) []string {
	keys := make([]string, len(doc))
	for i, e := range doc {
		keys[i] = e.Key
	}
	return keys
}

func equalKeys(got, want []string) bool { return strings.Join(got, ",") == strings.Join(want, ",") }

// Key order must survive at every depth: a compound sort, the key of a compound
// index, or the output field order of $addFields all depend on it.
func TestParseOrderedDocumentKeepsOrderAtEveryDepth(t *testing.T) {
	doc, err := ParseOrderedDocument(`{"b":1,"a":{"z":1,"y":[{"q":1,"p":2}]},"c":3}`)
	if err != nil {
		t.Fatal(err)
	}
	if !equalKeys(keysOf(doc), []string{"b", "a", "c"}) {
		t.Fatalf("top level: %v", keysOf(doc))
	}
	nested, ok := doc[1].Value.(bson.D)
	if !ok || !equalKeys(keysOf(nested), []string{"z", "y"}) {
		t.Fatalf("nested object: %#v", doc[1].Value)
	}
	inArray, ok := nested[1].Value.(bson.A)[0].(bson.D)
	if !ok || !equalKeys(keysOf(inArray), []string{"q", "p"}) {
		t.Fatalf("object inside an array: %#v", nested[1].Value)
	}
}

// The driver's own bson.D JSON decoder turns [] into nil, which encodes as BSON
// null, so {"$in": []} would silently become {"$in": null}. Empty containers
// must stay empty containers.
func TestParseOrderedDocumentKeepsEmptyContainers(t *testing.T) {
	doc, err := ParseOrderedDocument(`{"$in":[],"o":{}}`)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := bson.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	if got := bson.Raw(raw).String(); got != `{"$in": [],"o": {}}` {
		t.Fatalf("empty containers changed: %s", got)
	}
}

// Scalars keep the Go types encoding/json produces for map[string]any, so the
// BSON a pipeline encodes to is unchanged apart from key order.
func TestParseOrderedDocumentScalarTypesMatchMapDecoding(t *testing.T) {
	doc, err := ParseOrderedDocument(`{"n":1,"f":1.5,"s":"x","t":true,"z":null}`)
	if err != nil {
		t.Fatal(err)
	}
	want := []any{float64(1), 1.5, "x", true, nil}
	for i, e := range doc {
		if e.Value != want[i] {
			t.Errorf("%s = %#v (%T), want %#v", e.Key, e.Value, e.Value, want[i])
		}
	}
}

func TestParseOrderedDocumentRejectsBadInput(t *testing.T) {
	deep := strings.Repeat(`{"a":`, maxOrderedDepth+2) + "1" + strings.Repeat("}", maxOrderedDepth+2)
	for name, text := range map[string]string{
		"array":         `[1]`,
		"scalar":        `1`,
		"null":          `null`,
		"trailing data": `{"a":1} {"b":2}`,
		"syntax":        `{"a":`,
		"too deep":      deep,
	} {
		if _, err := ParseOrderedDocument(text); err == nil {
			t.Errorf("%s: accepted %q", name, text)
		}
	}
}

func TestParseOrderedPipeline(t *testing.T) {
	stages, err := ParseOrderedPipeline(`[{"$match":{"a":1}},{"$sort":{"b":-1,"a":1}}]`)
	if err != nil || len(stages) != 2 {
		t.Fatalf("stages=%v err=%v", stages, err)
	}
	if sort, ok := stages[1][0].Value.(bson.D); !ok || !equalKeys(keysOf(sort), []string{"b", "a"}) {
		t.Fatalf("$sort keys reordered: %#v", stages[1])
	}
	if empty, err := ParseOrderedPipeline(`[]`); err != nil || len(empty) != 0 {
		t.Fatalf("empty pipeline: %v %v", empty, err)
	}
	for name, text := range map[string]string{
		"object":        `{"$match":{}}`,
		"null":          `null`,
		"stage scalar":  `[1]`,
		"stage array":   `[[{"$match":{}}]]`,
		"trailing data": `[] []`,
	} {
		if _, err := ParseOrderedPipeline(text); err == nil {
			t.Errorf("%s: accepted %q", name, text)
		}
	}
}
