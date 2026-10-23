package engines

import "errors"

// ErrConnectionNotFound lets callers distinguish missing profiles.
var ErrConnectionNotFound = errors.New("Connection not found")
