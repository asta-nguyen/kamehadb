package dbcore

import (
	"errors"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/dbcore/mongo"
	"github.com/asta-nguyen/kamehadb/dbcore/redis"
)

type sqlOnly struct{ fakeProvider }

func (sqlOnly) SQL() engines.SQLAdapter { return nil }

type mongoOnly struct{ fakeProvider }

func (mongoOnly) Mongo() mongo.Operations { return nil }

type redisOnly struct{ fakeProvider }

func (redisOnly) Redis() redis.Operations { return nil }

func TestCapabilityHelpers(t *testing.T) {
	if _, err := SQL(nil); !errors.Is(err, ErrCapabilityUnsupported) {
		t.Fatal("nil provider must be unsupported")
	}
	if _, err := SQL(mongoOnly{}); !errors.Is(err, ErrCapabilityUnsupported) {
		t.Fatal("wrong-family provider must be unsupported")
	}
	if _, err := SQL(sqlOnly{}); !errors.Is(err, ErrCapabilityUnsupported) {
		t.Fatal("nil capability must be unsupported")
	}
	if _, err := Mongo(sqlOnly{}); !errors.Is(err, ErrCapabilityUnsupported) {
		t.Fatal("mongo on sql provider")
	}
	if _, err := Redis(sqlOnly{}); !errors.Is(err, ErrCapabilityUnsupported) {
		t.Fatal("redis on sql provider")
	}
	if _, err := Redis(redisOnly{}); !errors.Is(err, ErrCapabilityUnsupported) {
		t.Fatal("nil redis capability must be unsupported")
	}
}
