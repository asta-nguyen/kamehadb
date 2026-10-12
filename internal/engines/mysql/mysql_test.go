package mysql

import (
	"testing"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

func TestNewValidation(t *testing.T) {
	if _, err := New(engines.ConnProfile{Kind: engines.KindMySQL}); err == nil || err.Error() != "Database name is required" {
		t.Fatalf("want database error, got %v", err)
	}
	if _, err := New(engines.ConnProfile{Kind: engines.KindMySQL, Database: "d"}); err == nil || err.Error() != "Username is required" {
		t.Fatalf("want username error, got %v", err)
	}
	if _, err := New(engines.ConnProfile{Kind: engines.KindMySQL, Database: "d", Username: "u"}); err == nil || err.Error() != "Password is required" {
		t.Fatalf("want password error, got %v", err)
	}
	a, err := New(engines.ConnProfile{Kind: engines.KindMySQL, Database: "d", Username: "u", HasPassword: true})
	if err != nil {
		t.Fatalf("empty-but-present password should be accepted: %v", err)
	}
	defer a.Close()
	if a.isMariaDB {
		t.Fatal("mysql kind must not be mariaDB")
	}
}

func TestMariaDBFlag(t *testing.T) {
	a, err := New(engines.ConnProfile{Kind: engines.KindMariaDB, Database: "d", Username: "u", HasPassword: true})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if !a.isMariaDB {
		t.Fatal("mariadb kind must set isMariaDB")
	}
}

func TestSplitTableID(t *testing.T) {
	if s, tb := splitTableID("db", "sch.tbl"); s != "sch" || tb != "tbl" {
		t.Fatalf("got %q %q", s, tb)
	}
	if s, tb := splitTableID("db", "tbl"); s != "db" || tb != "tbl" {
		t.Fatalf("got %q %q", s, tb)
	}
	if s, tb := splitTableID("db", "a.b.c"); s != "a" || tb != "b" {
		t.Fatalf("TS drops extra segments: got %q %q", s, tb)
	}
}

func TestTimeoutWeakenHint(t *testing.T) {
	if !timeoutWeakenRe.MatchString("SELECT /*+ SET_VAR(max_execution_time=1) */ 1") {
		t.Fatal("should reject set_var max_execution_time hint")
	}
	if timeoutWeakenRe.MatchString("SELECT 1") {
		t.Fatal("plain select must pass")
	}
}

func TestEsc(t *testing.T) {
	a := &Adapter{}
	if got := a.esc("we`ird"); got != "`we``ird`" {
		t.Fatalf("got %q", got)
	}
}
