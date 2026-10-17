package engines

import (
	"math"
	"testing"
)

func TestJSONSafeInteger(t *testing.T) {
	for _, test := range []struct{ input, want any }{
		{int64(maxJSONSafeInteger), int64(maxJSONSafeInteger)},
		{int64(-maxJSONSafeInteger), int64(-maxJSONSafeInteger)},
		{int64(maxJSONSafeInteger + 1), "9007199254740992"},
		{int64(math.MinInt64), "-9223372036854775808"},
		{uint64(math.MaxUint64), "18446744073709551615"},
		{"not numeric", "not numeric"},
		{nil, nil},
	} {
		if got := JSONSafeInteger(test.input); got != test.want {
			t.Fatalf("%v: got %v, want %v", test.input, got, test.want)
		}
	}
}
