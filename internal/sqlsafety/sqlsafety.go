// Package sqlsafety ports the query screening from packages/shared/src/types.ts.
// Heuristic keyword screening, not a parser — semantics preserved exactly.
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

var (
	reBlockComment = regexp.MustCompile(`(?s)/\*.*?\*/`)
	reLineComment  = regexp.MustCompile(`--[^\n]*`)
	reSingleQuoted = regexp.MustCompile(`'(?:[^']|'')*'`)
	reDoubleQuoted = regexp.MustCompile(`"(?:[^"]|"")*"`)
)

var destructiveRes, safeRes []*regexp.Regexp

func init() {
	for _, kw := range destructiveKeywords {
		destructiveRes = append(destructiveRes, regexp.MustCompile(`\b`+kw+`\b`))
	}
	for _, kw := range safeKeywords {
		safeRes = append(safeRes, regexp.MustCompile(`^\b`+kw+`\b`))
	}
}

func isWordByte(b byte) bool {
	return b == '_' || b >= '0' && b <= '9' || b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z'
}

// stripDollarQuoted removes $tag$...$tag$ spans. RE2 lacks backreferences
// so the TS regex (\$\w*\$)[\s\S]*?\1 becomes a scanner: find the opening
// delimiter, then the first reoccurrence of the same delimiter.
func stripDollarQuoted(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	i := 0
	for i < len(s) {
		if s[i] == '$' {
			j := i + 1
			for j < len(s) && isWordByte(s[j]) {
				j++
			}
			if j < len(s) && s[j] == '$' {
				tag := s[i : j+1]
				if end := strings.Index(s[j+1:], tag); end >= 0 {
					b.WriteByte(' ')
					i = j + 1 + end + len(tag)
					continue
				}
			}
		}
		b.WriteByte(s[i])
		i++
	}
	return b.String()
}

// stripSqlNoise removes string literals, comments, and dollar-quoted text so
// keyword checks only inspect real SQL tokens. Noise → spaces keeps word
// boundaries. Same replacement order as the TS chain.
func stripSqlNoise(sql string) string {
	sql = stripDollarQuoted(sql)
	sql = reBlockComment.ReplaceAllString(sql, " ")
	sql = reLineComment.ReplaceAllString(sql, " ")
	sql = reSingleQuoted.ReplaceAllString(sql, " ")
	sql = reDoubleQuoted.ReplaceAllString(sql, " ")
	return sql
}

// Check mirrors isQuerySafe: rejects statement chains, destructive keywords,
// and statements not led by a safe keyword.
func Check(sql string) (safe bool, reason string) {
	stripped := stripSqlNoise(sql)
	normalized := strings.ToUpper(strings.TrimSpace(stripped))

	if normalized == "" {
		return true, ""
	}

	// Reject statement chains: checking only the first command would let a
	// read-only query hide a mutating command behind a semicolon.
	statement := normalized
	if strings.HasSuffix(statement, ";") {
		statement = statement[:len(statement)-1]
	}
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
