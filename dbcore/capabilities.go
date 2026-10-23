package dbcore

import (
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/dbcore/mongo"
	"github.com/asta-nguyen/kamehadb/dbcore/redis"
)

// Family accessors are asserted on the provider, never inferred from kind.
type (
	sqlCapable   interface{ SQL() engines.SQLAdapter }
	mongoCapable interface{ Mongo() mongo.Operations }
	redisCapable interface{ Redis() redis.Operations }
)

// SQL returns the provider's SQL capability or ErrCapabilityUnsupported.
func SQL(p Provider) (engines.SQLAdapter, error) {
	c, ok := p.(sqlCapable)
	if !ok {
		return nil, ErrCapabilityUnsupported
	}
	a := c.SQL()
	if a == nil {
		return nil, ErrCapabilityUnsupported
	}
	return a, nil
}

// Mongo returns the provider's MongoDB capability or ErrCapabilityUnsupported.
func Mongo(p Provider) (mongo.Operations, error) {
	c, ok := p.(mongoCapable)
	if !ok {
		return nil, ErrCapabilityUnsupported
	}
	o := c.Mongo()
	if o == nil {
		return nil, ErrCapabilityUnsupported
	}
	return o, nil
}

// Redis returns the provider's Redis capability or ErrCapabilityUnsupported.
func Redis(p Provider) (redis.Operations, error) {
	c, ok := p.(redisCapable)
	if !ok {
		return nil, ErrCapabilityUnsupported
	}
	o := c.Redis()
	if o == nil {
		return nil, ErrCapabilityUnsupported
	}
	return o, nil
}
