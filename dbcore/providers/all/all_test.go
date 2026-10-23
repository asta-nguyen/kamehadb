package all

import (
	"context"
	"errors"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

func TestNewRegistersTenKinds(t *testing.T) {
	r, err := New(Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Kinds()) != 10 {
		t.Fatalf("kinds: %v", r.Kinds())
	}
	// A second registry is isolated and registers cleanly.
	if _, err := New(Options{}); err != nil {
		t.Fatal(err)
	}
	for _, k := range engines.AllKinds {
		_, err := r.Open(context.Background(), k, dbcore.Config{Kind: k})
		// Construction may fail without servers, but selection must not.
		if errors.Is(err, dbcore.ErrProviderNotRegistered) {
			t.Fatalf("%s not registered", k)
		}
	}
}
