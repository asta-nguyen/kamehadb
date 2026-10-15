package mongo

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func stageNames(pipeline []bson.D) []string {
	names := make([]string, len(pipeline))
	for i, stage := range pipeline {
		names[i] = stage[0].Key
	}
	return names
}

func mustStages(t *testing.T, text string) []bson.D {
	t.Helper()
	stages, err := ParseOrderedPipeline(text)
	if err != nil {
		t.Fatal(err)
	}
	return stages
}

// The GUI page pipeline appends the skip and a one-extra-row limit; the count
// pipeline drops the user's own $skip/$limit and caps the count. Ordered stages
// must pass through untouched.
func TestBuildAggregatePipelines(t *testing.T) {
	const pageLimit = int64(50)
	for _, test := range []struct {
		name         string
		pipeline     string
		skip         int64
		final, count []string
	}{
		{"plain", `[{"$match":{}}]`, 0, []string{"$match", "$limit"}, []string{"$match", "$count", "$limit"}},
		{"skip is added to the page pipeline only", `[{"$match":{}}]`, 10, []string{"$match", "$skip", "$limit"}, []string{"$match", "$count", "$limit"}},
		{"user limit replaces the default limit", `[{"$limit":5}]`, 0, []string{"$limit"}, []string{"$count", "$limit"}},
		{"user skip and limit leave the count alone", `[{"$match":{}},{"$skip":3},{"$limit":4}]`, 0, []string{"$match", "$skip", "$limit"}, []string{"$match", "$count", "$limit"}},
		{"empty pipeline", `[]`, 0, []string{"$limit"}, []string{"$count", "$limit"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			final := buildAggregatePipelines(mustStages(t, test.pipeline), test.skip, pageLimit)
			if !equalKeys(stageNames(final), test.final) {
				t.Errorf("page pipeline %v, want %v", stageNames(final), test.final)
			}
		})
	}

	// Values the builder appends.
	final := buildAggregatePipelines(mustStages(t, `[{"$match":{}}]`), 7, pageLimit)
	if final[1][0].Value != int64(7) || final[2][0].Value != pageLimit+1 {
		t.Errorf("appended $skip/$limit: %v", final[1:])
	}
}

// Stage content must reach the server in the order it was written.
func TestBuildAggregatePipelinesKeepsStageContentOrder(t *testing.T) {
	final := buildAggregatePipelines(mustStages(t, `[{"$sort":{"b":-1,"a":1}}]`), 0, 10)
	sortSpec, ok := final[0][0].Value.(bson.D)
	if !ok || !equalKeys(keysOf(sortSpec), []string{"b", "a"}) {
		t.Errorf("page pipeline reordered $sort: %#v", final[0])
	}
}
