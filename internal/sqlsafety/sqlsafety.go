// Package sqlsafety ports the query screening from packages/shared/src/types.ts.
// Heuristic keyword screening, not a parser. It is a first filter only: each
// engine's read-only transaction or account grants remain the real boundary.
package sqlsafety

import (
	"regexp"
	"strings"
)

var destructiveKeywords = []string{
	"DROP", "TRUNCATE", "ALTER", "CREATE", "INSERT", "INTO",
	"UPDATE", "DELETE", "MERGE", "GRANT", "REVOKE",
}

var safeKeywords = []string{"SELECT", "WITH", "SHOW", "DESCRIBE", "EXPLAIN"}

var destructiveRes, safeRes []*regexp.Regexp

func init() {
	for _, kw := range destructiveKeywords {
		destructiveRes = append(destructiveRes, regexp.MustCompile(`\b`+kw+`\b`))
	}
	for _, kw := range safeKeywords {
		safeRes = append(safeRes, regexp.MustCompile(`^\b`+kw+`\b`))
	}
}

// lexMode captures the dialect-specific lexical rules that decide which text is
// noise (a comment or quoted text) rather than executable SQL.
type lexMode struct {
	backslashEscapes bool // MySQL/ClickHouse: \ escapes inside '...' and "..."
	eStrings         bool // PostgreSQL: E'...' strings escape with backslash
	hashComments     bool // MySQL/ClickHouse: # starts a line comment
	dashNeedsSpace   bool // MySQL: "--" is a comment only before whitespace
	execComments     bool // MySQL: /*! ... */ content is executed, not noise
	backtickIdents   bool // MySQL/ClickHouse/SQLite: `identifier`
	bracketIdents    bool // SQL Server/SQLite: [identifier]
}

// lexModes lists the dialect lexings Check must agree on. Dialects disagree on
// where a string or comment ends, so text one mode hides can be live SQL in
// another. Check accepts a query only if no mode finds a hidden statement, which
// stays safe whichever engine really runs it. Block comments are matched
// without nesting in every mode: that hides no more than any dialect does.
var lexModes = []lexMode{
	{eStrings: true}, // PostgreSQL / ANSI
	{backslashEscapes: true, hashComments: true, dashNeedsSpace: true, execComments: true, backtickIdents: true}, // MySQL / MariaDB / ClickHouse
	{backtickIdents: true, bracketIdents: true}, // SQL Server / SQLite
}

func isWordByte(b byte) bool {
	return b == '_' || b >= '0' && b <= '9' || b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z'
}

// isIdentByte also accepts "$", which PostgreSQL allows inside identifiers.
func isIdentByte(b byte) bool { return isWordByte(b) || b == '$' }

// skipDelimited returns the index after the closer of the span opening at
// start. A doubled closer is a literal, and with backslash set "\" escapes the
// next byte. ok is false for an unterminated span, which the caller leaves
// visible so a missing quote can never hide the text after it.
func skipDelimited(s string, start int, closer byte, backslash bool) (end int, ok bool) {
	for i := start + 1; i < len(s); i++ {
		switch {
		case backslash && s[i] == '\\':
			i++ // The escaped byte can never close the span.
		case s[i] == closer:
			if i+1 < len(s) && s[i+1] == closer {
				i++
				continue
			}
			return i + 1, true
		}
	}
	return 0, false
}

// dollarQuoteEnd returns the index after a $tag$...$tag$ span starting at i, or
// -1. RE2 lacks backreferences, so the closing tag is located with
// strings.Index. PostgreSQL opens a quote only at a token start, so a "$" inside
// an identifier (a$b$) or a positional parameter ($1) never does.
func dollarQuoteEnd(s string, i int) int {
	if i > 0 && isIdentByte(s[i-1]) {
		return -1
	}
	j := i + 1
	if j < len(s) && s[j] >= '0' && s[j] <= '9' {
		return -1
	}
	for j < len(s) && isWordByte(s[j]) {
		j++
	}
	if j >= len(s) || s[j] != '$' {
		return -1
	}
	tag := s[i : j+1]
	end := strings.Index(s[j+1:], tag)
	if end < 0 {
		return -1
	}
	return j + 1 + end + len(tag)
}

// isEStringQuote reports whether the quote at i opens a PostgreSQL E'...'
// string, the one PostgreSQL form where backslash escapes a quote.
func isEStringQuote(s string, i int) bool {
	if i == 0 || (s[i-1] != 'E' && s[i-1] != 'e') {
		return false
	}
	return i == 1 || !isIdentByte(s[i-2])
}

// lineEnd returns the index of the newline ending the comment at i (or len(s)).
func lineEnd(s string, i int) int {
	if n := strings.IndexByte(s[i:], '\n'); n >= 0 {
		return i + n
	}
	return len(s)
}

// skipNoise returns the index after the noise token starting at i, or i when
// the byte at i starts none. inExec tracks an open MySQL /*! ... */ comment:
// its markers are skipped but its content stays visible because MySQL runs it.
func skipNoise(s string, i int, m lexMode, inExec *bool) int {
	c := s[i]
	switch {
	case c == '\'' || c == '"':
		backslash := m.backslashEscapes || (c == '\'' && m.eStrings && isEStringQuote(s, i))
		if end, ok := skipDelimited(s, i, c, backslash); ok {
			return end
		}
	case c == '`' && m.backtickIdents:
		if end, ok := skipDelimited(s, i, '`', false); ok {
			return end
		}
	case c == '[' && m.bracketIdents:
		if end, ok := skipDelimited(s, i, ']', false); ok {
			return end
		}
	case c == '$':
		if end := dollarQuoteEnd(s, i); end >= 0 {
			return end
		}
	case c == '-' && strings.HasPrefix(s[i:], "--"):
		if !m.dashNeedsSpace || i+2 >= len(s) || s[i+2] <= ' ' {
			return lineEnd(s, i)
		}
	case c == '#' && m.hashComments:
		return lineEnd(s, i)
	case c == '/' && strings.HasPrefix(s[i:], "/*"):
		if m.execComments && strings.HasPrefix(s[i:], "/*!") {
			*inExec = true
			return i + 3
		}
		if end := strings.Index(s[i+2:], "*/"); end >= 0 {
			return i + 2 + end + 2
		}
	case c == '*' && *inExec && strings.HasPrefix(s[i:], "*/"):
		*inExec = false
		return i + 2
	}
	return i
}

// stripSqlNoise removes string literals, quoted identifiers, comments, and
// dollar-quoted text in one left-to-right pass so keyword checks only inspect
// real SQL tokens. Scanning once, in source order, is what keeps a quote inside
// a comment (or a comment marker inside a string) from being misread; the old
// regex chain stripped one kind at a time and could be steered into hiding a
// second statement. Noise becomes a space to keep word boundaries.
func stripSqlNoise(sql string, m lexMode) string {
	var b strings.Builder
	b.Grow(len(sql))
	inExec := false
	for i := 0; i < len(sql); {
		if end := skipNoise(sql, i, m, &inExec); end > i {
			b.WriteByte(' ')
			i = end
			continue
		}
		b.WriteByte(sql[i])
		i++
	}
	return b.String()
}

// Check mirrors isQuerySafe: rejects statement chains, destructive keywords,
// and statements not led by a safe keyword, under every dialect lexing.
func Check(sql string) (safe bool, reason string) {
	for _, m := range lexModes {
		if ok, why := checkStripped(stripSqlNoise(sql, m)); !ok {
			return false, why
		}
	}
	return true, ""
}

// checkStripped applies the keyword rules to text already stripped of noise.
func checkStripped(stripped string) (safe bool, reason string) {
	normalized := strings.ToUpper(strings.TrimSpace(stripped))

	if normalized == "" {
		return true, ""
	}

	// Reject statement chains: checking only the first command would let a
	// read-only query hide a mutating command behind a semicolon.
	statement := strings.TrimSuffix(normalized, ";")
	if strings.Contains(statement, ";") {
		return false, "Only one read-only statement can run automatically"
	}

	for i, kw := range destructiveKeywords {
		if destructiveRes[i].MatchString(normalized) {
			return false, kw + " statements are not allowed in read-only mode"
		}
	}

	for _, re := range safeRes {
		if re.MatchString(statement) {
			return true, ""
		}
	}

	return false, "Only read-only SELECT, WITH, SHOW, DESCRIBE, and EXPLAIN statements are allowed"
}

// IsQuerySafe is the boolean shorthand matching the TS call shape.
func IsQuerySafe(sql string) bool {
	safe, _ := Check(sql)
	return safe
}

// IsAllowedSortColumn — ORDER BY identifiers cannot be parameterized, so
// only names returned by schema metadata may be interpolated. A nil value
// is unset → allowed (TS `value === undefined` → true).
func IsAllowedSortColumn(value *string, columns []string) bool {
	if value == nil {
		return true
	}
	for _, c := range columns {
		if c == *value {
			return true
		}
	}
	return false
}
