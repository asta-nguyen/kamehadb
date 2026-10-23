package engines

import "testing"

func TestPreviewOrderBy(t *testing.T) {
	quote := func(name string) string { return `"` + name + `"` }
	single := []ColumnInfo{{Name: "id", PrimaryKey: true}, {Name: "name"}}
	composite := []ColumnInfo{{Name: "a", PrimaryKey: true}, {Name: "b", PrimaryKey: true}, {Name: "c"}}
	for _, test := range []struct {
		name      string
		columns   []ColumnInfo
		sort, dir string
		want      string
	}{
		{"non-key sort gets the key as tiebreaker", single, "name", "desc", `"name" DESC, "id" ASC`},
		{"tiebreaker is always ascending", single, "name", "asc", `"name" ASC, "id" ASC`},
		{"sorting by the only key adds nothing", single, "id", "desc", `"id" DESC`},
		{"composite key orders by every key column", composite, "", "", `"a" ASC, "b" ASC`},
		{"sorting by part of a composite key appends the rest", composite, "b", "", `"b" ASC, "a" ASC`},
		{"no key and no sort leaves the natural order", []ColumnInfo{{Name: "c"}}, "", "", ""},
		{"no key still honors an explicit sort", []ColumnInfo{{Name: "c"}}, "c", "desc", `"c" DESC`},
	} {
		if got := PreviewOrderBy(test.columns, test.sort, test.dir, quote); got != test.want {
			t.Errorf("%s: got %q, want %q", test.name, got, test.want)
		}
	}
}
