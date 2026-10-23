package engines

import (
	"context"

	db "github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// SQLLookup is the app-only facade SqlService/SchemaService/AiService use for
// per-connection SQL adapters. The shared dbcore Manager supplies it.
type SQLLookup interface {
	Get(ctx context.Context, connectionID string) (db.SQLAdapter, error)
}
