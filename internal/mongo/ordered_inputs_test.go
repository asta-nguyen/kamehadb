package mongo

import (
	"encoding/json"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// orderedInputRuns is high enough that a map-based path would almost surely show
// a wrong key order: a three-key Go map came out in the typed order only ~75% of
// the time when measured.
const orderedInputRuns = 200

// The Wails boundary decodes the JSON body into these structs, so the tests start
// from the same JSON text the frontend sends.
func TestAggregateInputKeepsStageKeyOrder(t *testing.T) {
	var in AggregateInput
	body := `{"collection":"c","pipelineJson":"[{\"$sort\":{\"score\":-1,\"name\":1,\"age\":1}}]"}`
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < orderedInputRuns; i++ {
		stages, err := in.stages()
		if err != nil {
			t.Fatal(err)
		}
		raw, err := bson.Marshal(stages[0])
		if err != nil {
			t.Fatal(err)
		}
		sortSpec, _ := stages[0][0].Value.(bson.D)
		if !equalKeys(keysOf(sortSpec), []string{"score", "name", "age"}) {
			t.Fatalf("run %d: $sort order %v (%s)", i, keysOf(sortSpec), bson.Raw(raw))
		}
	}
}

// Older callers still send the map form. Its order is already lost, so stage
// keys are sorted: deterministic, but not a user-specified order.
func TestAggregateInputLegacyMapStagesAreDeterministic(t *testing.T) {
	in := AggregateInput{Pipeline: []map[string]any{{"$match": 1, "$limit": 2, "$skip": 3}}}
	for i := 0; i < orderedInputRuns; i++ {
		stages, err := in.stages()
		if err != nil || len(stages) != 1 || !equalKeys(keysOf(stages[0]), []string{"$limit", "$match", "$skip"}) {
			t.Fatalf("run %d: %v %v", i, stages, err)
		}
	}
}

func TestAggregateInputPipelineJSONWinsAndIsValidated(t *testing.T) {
	in := AggregateInput{
		Pipeline:     []map[string]any{{"$match": 1}},
		PipelineJSON: `[{"$project":{"a":1}}]`,
	}
	stages, err := in.stages()
	if err != nil || len(stages) != 1 || stages[0][0].Key != "$project" {
		t.Fatalf("pipelineJson must win: %v %v", stages, err)
	}
	in.PipelineJSON = `{"not":"an array"}`
	if _, err := in.stages(); err == nil {
		t.Fatal("invalid pipelineJson accepted")
	}
}

func TestFindInputSortSpec(t *testing.T) {
	var in FindDocumentsInput
	if err := json.Unmarshal([]byte(`{"collection":"c","sortJson":"{\"score\":-1,\"name\":1}"}`), &in); err != nil {
		t.Fatal(err)
	}
	spec, err := in.sortSpec()
	if err != nil || !equalKeys(keysOf(spec), []string{"score", "name"}) {
		t.Fatalf("typed order lost: %v %v", spec, err)
	}

	legacy, err := FindDocumentsInput{Sort: map[string]int32{"score": -1, "name": 1}}.sortSpec()
	if err != nil || !equalKeys(keysOf(legacy), []string{"name", "score"}) {
		t.Fatalf("legacy map sort must stay alphabetical: %v %v", legacy, err)
	}
	if spec, err := (FindDocumentsInput{}).sortSpec(); err != nil || len(spec) != 0 {
		t.Fatalf("no sort: %v %v", spec, err)
	}
	if _, err := (FindDocumentsInput{SortJSON: `[1]`}).sortSpec(); err == nil {
		t.Fatal("invalid sortJson accepted")
	}
}

// The command name must be the first field, and nested order (here the key of a
// compound index) must not be reshuffled either.
func TestMongoCommandRequestDocument(t *testing.T) {
	var req MongoCommandRequest
	body := `{"database":"d","commandJson":"{\"createIndexes\":\"items\",\"indexes\":[{\"key\":{\"b\":-1,\"a\":1},\"name\":\"n\"}]}"}`
	if err := json.Unmarshal([]byte(body), &req); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < orderedInputRuns; i++ {
		command, err := req.Document()
		if err != nil {
			t.Fatal(err)
		}
		doc, ok := command.(bson.D)
		if !ok || doc[0].Key != "createIndexes" {
			t.Fatalf("run %d: command name not first: %#v", i, command)
		}
		index := doc[1].Value.(bson.A)[0].(bson.D)
		key := index[0].Value.(bson.D)
		if !equalKeys(keysOf(key), []string{"b", "a"}) {
			t.Fatalf("run %d: index key reordered: %v", i, keysOf(key))
		}
	}

	legacy := map[string]any{"ping": 1}
	got, err := (MongoCommandRequest{Command: legacy}).Document()
	if err != nil || got == nil {
		t.Fatalf("legacy map command: %v %v", got, err)
	}
	if _, err := (MongoCommandRequest{CommandJSON: `[1]`}).Document(); err == nil {
		t.Fatal("invalid commandJson accepted")
	}
}
