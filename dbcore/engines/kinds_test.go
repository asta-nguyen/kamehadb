package engines

import "testing"

func TestAllKindsExactlyTen(t *testing.T) {
	if len(AllKinds) != 10 {
		t.Fatalf("live kinds: %d", len(AllKinds))
	}
	for _, k := range AllKinds {
		if _, ok := DefaultPorts[k]; !ok {
			t.Errorf("no default port for %s", k)
		}
		if !IsValidKind(k) {
			t.Errorf("%s not live", k)
		}
	}
	for _, k := range SQLKinds {
		if !IsSQLKind(k) {
			t.Errorf("%s not sql", k)
		}
	}
	if len(SQLKinds)+len(NoSQLKinds) != len(AllKinds) {
		t.Error("sql+nosql must cover live kinds")
	}
}
