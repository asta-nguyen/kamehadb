package schema

import (
	"strings"
	"testing"
)

func col(name, typ string, nullable bool, pk bool) ColumnSnapshot {
	return ColumnSnapshot{Name: name, Type: typ, Nullable: nullable, PrimaryKey: pk}
}

func TestCompareSnapshots(t *testing.T) {
	before := &SnapshotRecord{ID: "a", ConnectionID: "c", CapturedAt: "t1", Tables: []TableSnapshot{
		{
			ID: "main.users", Name: "users", Schema: "main",
			Columns: []ColumnSnapshot{col("id", "INTEGER", false, true), col("name", "TEXT", true, false)},
			Indexes: []IndexSnapshot{{Name: "idx_name", Columns: []string{"name"}}},
		},
		{ID: "main.old", Name: "old", Schema: "main", Columns: []ColumnSnapshot{col("id", "INTEGER", false, false)}},
	}}
	after := &SnapshotRecord{ID: "b", ConnectionID: "c", CapturedAt: "t2", Tables: []TableSnapshot{
		{
			ID: "main.users", Name: "users", Schema: "main",
			Columns: []ColumnSnapshot{
				col("id", "INTEGER", false, true),
				col("name", "TEXT", false, false), // nullable flipped
				col("email", "TEXT", true, false),
			},
			Indexes: []IndexSnapshot{{Name: "idx_name", Columns: []string{"name", "email"}, Unique: true}},
		},
		{ID: "main.orders", Name: "orders", Schema: "main", Columns: []ColumnSnapshot{col("id", "INTEGER", false, true)}},
	}}

	diff := CompareSnapshots(before, after)
	if diff.Stats.TableAdds != 1 || diff.Stats.TableRemovals != 1 || diff.Stats.TableChanges != 1 {
		t.Fatalf("stats: %+v", diff.Stats)
	}
	if diff.Stats.ColumnAdds != 1 || diff.Stats.ColumnChanges != 1 {
		t.Fatalf("col stats: %+v", diff.Stats)
	}
	if diff.Stats.IndexChanges != 1 {
		t.Fatalf("idx stats: %+v", diff.Stats)
	}
	total := diff.Stats.TableAdds + diff.Stats.TableRemovals + diff.Stats.ColumnAdds +
		diff.Stats.ColumnRemovals + diff.Stats.ColumnChanges + diff.Stats.IndexAdds +
		diff.Stats.IndexRemovals + diff.Stats.IndexChanges
	if total != diff.Stats.TotalChanges {
		t.Fatalf("total mismatch: %+v", diff.Stats)
	}

	// Find the changed table diff and check field-level changes.
	var usersDiff *TableDiff
	for i := range diff.TableDiffs {
		if diff.TableDiffs[i].TableID == "main.users" {
			usersDiff = &diff.TableDiffs[i]
		}
	}
	if usersDiff == nil || usersDiff.Type != "changed" {
		t.Fatalf("users diff: %+v", diff.TableDiffs)
	}
	foundNullable := false
	for _, cd := range usersDiff.ColumnDiffs {
		if cd.Type != "changed" || cd.ColumnName != "name" {
			continue
		}
		for _, ch := range cd.Changes {
			if ch.Field == "nullable" && ch.From == true && ch.To == false {
				foundNullable = true
			}
		}
	}
	if !foundNullable {
		t.Fatalf("nullable change missing: %+v", usersDiff.ColumnDiffs)
	}
}

func TestToChangelogChanges(t *testing.T) {
	before := &SnapshotRecord{ID: "a", CapturedAt: "t1"}
	after := &SnapshotRecord{ID: "b", CapturedAt: "t2", Tables: []TableSnapshot{
		{ID: "main.t", Name: "t", Columns: []ColumnSnapshot{col("id", "int", false, true)}},
	}}
	changes := ToChangelogChanges(CompareSnapshots(before, after))
	if len(changes) != 1 || changes[0].Type != "table_added" || changes[0].Table != "main.t" {
		t.Fatalf("%+v", changes)
	}
}

func TestGenerateMigration(t *testing.T) {
	before := &SnapshotRecord{ID: "a", CapturedAt: "t1", Tables: []TableSnapshot{
		{
			ID: "public.users", Name: "users", Schema: "public",
			Columns: []ColumnSnapshot{col("id", "int", false, true)},
		},
	}}
	def := "'x'"
	after := &SnapshotRecord{ID: "b", CapturedAt: "t2", Tables: []TableSnapshot{
		{
			ID: "public.users", Name: "users", Schema: "public",
			Columns: []ColumnSnapshot{
				col("id", "bigint", false, true),
				{Name: "tag", Type: "text", Nullable: false, Default: &def},
			},
			Indexes: []IndexSnapshot{{Name: "ix_tag", Columns: []string{"tag"}, Unique: true}},
		},
		{
			ID: "public.logs", Name: "logs", Schema: "public",
			Columns: []ColumnSnapshot{col("a", "int", false, true), col("b", "int", false, true)},
		},
	}}

	m := GenerateMigration(CompareSnapshots(before, after), DialectPostgres)
	joined := strings.Join(m.Statements, "\n")
	for _, want := range []string{
		`ALTER TABLE "public"."users" ALTER COLUMN "id" TYPE bigint;`,
		`ALTER TABLE "public"."users" ADD COLUMN "tag" text NOT NULL DEFAULT 'x';`,
		`CREATE UNIQUE INDEX "ix_tag" ON "public"."users" ("tag");`,
		`PRIMARY KEY ("a", "b")`,
		`CREATE TABLE "public"."logs"`,
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing %q in:\n%s", want, joined)
		}
	}

	// MySQL DROP INDEX uses ON table.
	before2 := &SnapshotRecord{ID: "a", CapturedAt: "t1", Tables: []TableSnapshot{
		{ID: "d.t", Name: "t", Indexes: []IndexSnapshot{{Name: "ix", Columns: []string{"c"}}}},
	}}
	after2 := &SnapshotRecord{ID: "b", CapturedAt: "t2", Tables: []TableSnapshot{
		{ID: "d.t", Name: "t"},
	}}
	m2 := GenerateMigration(CompareSnapshots(before2, after2), DialectMySQL)
	joined2 := strings.Join(m2.Statements, "\n")
	if !strings.Contains(joined2, `DROP INDEX "ix" ON "d"."t";`) {
		t.Fatalf("mysql drop index: %s", joined2)
	}
}

func TestResolveDialect(t *testing.T) {
	cases := map[string]string{
		"mysql": DialectMySQL, "mariadb": DialectMySQL, "postgres": DialectPostgres,
		"oracle": DialectOracle, "mongodb": defaultDialect, "": defaultDialect,
	}
	for kind, want := range cases {
		if got := ResolveDialect(kind); got != want {
			t.Fatalf("kind %q: got %q want %q", kind, got, want)
		}
	}
}
