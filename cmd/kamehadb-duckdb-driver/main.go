// The only production command importing the native DuckDB library. Stdout
// is exclusively framed RPC; errors and native diagnostics belong on stderr.
package main

import (
	"context"
	"fmt"
	"os"

	"github.com/asta-nguyen/kamehadb/dbcore/duckdriver"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/duckdb/embedded"
)

func main() {
	err := duckdriver.Serve(context.Background(), os.Stdin, os.Stdout,
		func(ctx context.Context, input duckdriver.OpenInput) (engines.SQLAdapter, error) {
			if input.TempDir == "" {
				return nil, fmt.Errorf("DuckDB helper requires a parent-owned spill directory")
			}
			return embedded.NewWithTempDir(ctx, input.FilePath, input.TempDir)
		})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
