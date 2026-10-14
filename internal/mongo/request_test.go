package mongo

import "testing"

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
