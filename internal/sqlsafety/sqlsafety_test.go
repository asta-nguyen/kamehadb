package sqlsafety

import "testing"

func TestIsQuerySafe(t *testing.T) {
	safe := []string{
		"SELECT * FROM users",
		"select id from t",
		"  SELECT 1  ",
		"SELECT 1;",
		"WITH x AS (SELECT 1) SELECT * FROM x",
		"EXPLAIN ANALYZE SELECT 1",
		"SHOW TABLES",
		"DESCRIBE users",
		"",                           // empty is safe
		"   ",                        // whitespace only
		"SELECT 'a; b'",              // semicolon inside string literal is noise
		"-- DELETE FROM t\nSELECT 1", // comment stripped
		"SELECT $$DROP TABLE x$$",
		"SELECT $tag$DELETE$tag$",
		`SELECT "col;name" FROM t`,
		"/* DROP TABLE x */ SELECT 1",
	}
	for _, q := range safe {
		if ok, reason := Check(q); !ok {
			t.Errorf("expected safe: %q (reason: %s)", q, reason)
		}
	}

	unsafe := []struct {
		query  string
		reason string
	}{
		{"DROP TABLE users", "DROP statements are not allowed in read-only mode"},
		{"SELECT 1; DELETE FROM users", "Only one read-only statement can run automatically"},
		{"INSERT INTO t VALUES (1)", "INSERT statements are not allowed in read-only mode"},
		{"UPDATE t SET x = 1", "UPDATE statements are not allowed in read-only mode"},
		{"SELECT * INTO newt FROM t", "INTO statements are not allowed in read-only mode"},
		{"GRANT SELECT ON t TO u", "GRANT statements are not allowed in read-only mode"},
		{"VACUUM users", "Only read-only SELECT, WITH, SHOW, DESCRIBE, and EXPLAIN statements are allowed"},
		{"TRUNCATE t", "TRUNCATE statements are not allowed in read-only mode"},
		{"SELECT 1;; DROP TABLE x", "Only one read-only statement can run automatically"},
		{"CREATE TABLE x (id int)", "CREATE statements are not allowed in read-only mode"},
	}
	for _, c := range unsafe {
		ok, reason := Check(c.query)
		if ok {
			t.Errorf("expected unsafe: %q", c.query)
		} else if reason != c.reason {
			t.Errorf("%q: reason %q, want %q", c.query, reason, c.reason)
		}
	}
}

// Each payload hides a second statement behind text that one lexical rule
// treats as noise while another dialect (or an earlier token) does not. The
// old regex chain stripped comments before strings, so the first four passed.
func TestCheckRejectsLexicalBypass(t *testing.T) {
	payloads := []string{
		"SELECT '--'; COMMIT; DELETE FROM t",
		"SELECT '/*'; DROP TABLE t; SELECT '*/'",
		"SELECT 1 AS a$b$; DROP TABLE t; SELECT 2 AS c$b$",
		`SELECT '\''; DROP TABLE t; SELECT 'a'`,
		`SELECT E'\''; DROP TABLE t; SELECT E'\''`,
		"SELECT 1 # '\n; DROP TABLE t; SELECT '",
		"SELECT 1--1; DROP TABLE t",
		"SELECT 1 /*! ; DROP TABLE t */",
		"SELECT 1 /*!50000 INTO OUTFILE '/tmp/x' */",
		"SELECT [a'b]; DROP TABLE t; SELECT [c'd]",
		"SELECT `a'b`; DROP TABLE t; SELECT `c'd`",
	}
	for _, q := range payloads {
		if ok, _ := Check(q); ok {
			t.Errorf("hidden statement accepted: %q", q)
		}
	}
}

// Tightening the lexer must not reject ordinary read-only queries.
func TestCheckStillAllowsQuotedAndCommentedText(t *testing.T) {
	queries := []string{
		"SELECT 'it''s' FROM t",
		`SELECT 'C:\temp\' AS p FROM t`,
		`SELECT E'it\'s' FROM t`,
		"SELECT arr[1] FROM t",
		"SELECT `col` FROM t",
		"SELECT [col] FROM t",
		"SELECT /*+ INDEX(t i) */ * FROM t",
		"SELECT 1 -- trailing comment",
		"SELECT * FROM t WHERE a = 'x -- not a comment'",
		"SELECT $1, $2 FROM t",
		"SELECT 5 # 3",
	}
	for _, q := range queries {
		if ok, reason := Check(q); !ok {
			t.Errorf("expected safe: %q (reason: %s)", q, reason)
		}
	}
}

func TestStripDollarQuoted(t *testing.T) {
	ansi := lexModes[0]
	// Dollar-quoted destructive keywords are noise — the query is a bare SELECT.
	if ok, _ := Check("SELECT $body$INSERT INTO t$body$"); !ok {
		t.Error("dollar-quoted INSERT should be stripped")
	}
	got := stripSqlNoise("a $$x$$ b", ansi)
	if got != "a   b" {
		t.Errorf("dollar strip: %q", got)
	}
	got = stripSqlNoise("a $tag$x y$tag$ b", ansi)
	if got != "a   b" {
		t.Errorf("tagged strip: %q", got)
	}
	// Unclosed dollar-quote is left alone.
	got = stripSqlNoise("a $tag$never closed", ansi)
	if got != "a $tag$never closed" {
		t.Errorf("unclosed: %q", got)
	}
	// A "$" inside an identifier never opens a quote.
	got = stripSqlNoise("a$b$ x a$b$", ansi)
	if got != "a$b$ x a$b$" {
		t.Errorf("identifier dollar: %q", got)
	}
}

func TestIsAllowedSortColumn(t *testing.T) {
	cols := []string{"id", "name", "created_at"}
	v := "name"
	if !IsAllowedSortColumn(&v, cols) {
		t.Error("allowed column rejected")
	}
	bad := "evil"
	if IsAllowedSortColumn(&bad, cols) {
		t.Error("unknown column allowed")
	}
	if !IsAllowedSortColumn(nil, cols) {
		t.Error("nil should be allowed (unset)")
	}
}
