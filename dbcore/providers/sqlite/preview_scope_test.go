package sqlite

import (
	"context"
	"errors"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// Identical table names/files do not make bookmarks transferable between
// normal/read-only/reopened adapters: scope follows the logical owner.
func TestSQLitePreviewAdapterScope(t *testing.T) {
	a, path := openTest(t)
	if _, err := a.db.Exec("CREATE TABLE scoped(id INTEGER PRIMARY KEY);INSERT INTO scoped VALUES(1),(2)"); err != nil {
		t.Fatal(err)
	}
	limit := int64(1)
	input := engines.PreviewRowsInput{TableID: "scoped", Limit: &limit}
	page, err := a.PreviewRows(context.Background(), input)
	if err != nil || page.NextCursor == "" {
		t.Fatal(page, err)
	}
	input.Cursor = page.NextCursor
	other, err := New(engines.ConnProfile{FilePath: path})
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	if _, err := other.PreviewRows(context.Background(), input); !errors.Is(err, engines.ErrPreviewCursor) {
		t.Fatal("normal adapter accepted foreign bookmark", err)
	}
	readonly, err := NewMCP(path)
	if err != nil {
		t.Fatal(err)
	}
	defer readonly.Close()
	if _, err := readonly.PreviewRows(context.Background(), input); !errors.Is(err, engines.ErrPreviewCursor) {
		t.Fatal("read-only adapter accepted foreign bookmark", err)
	}
	if _, err := a.PreviewRows(context.Background(), input); err != nil {
		t.Fatal("owner rejected its own bookmark", err)
	}
}
