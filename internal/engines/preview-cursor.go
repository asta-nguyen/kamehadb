package engines

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

const (
	PaginationKeyset       = "keyset"
	PaginationOffset       = "offset"
	PaginationAuto         = "auto"
	previewCursorVersion   = 2
	previewIntegerBits     = 64
	previewWideIntegerBits = 128
)

var ErrPreviewCursor = errors.New("paging cursor is invalid or no longer matches this view; restart at the first page")

// Oracle proves integrality only with declared precision and scale zero.
// Native previews project these keys as decimal text, avoiding driver floats.
var oraclePreviewInteger = regexp.MustCompile(`(?i)^number\(([1-9]|[12][0-9]|3[0-8]),0\)$`)

type previewCursor struct {
	Version int             `json:"v"`
	Table   string          `json:"t"`
	Column  string          `json:"k"`
	Context string          `json:"c"`
	Value   json.RawMessage `json:"x"`
}

// A scope belongs to one cached adapter/owned helper. Reopening or changing a
// profile requires new bookmarks; equal table/key names cannot cross profiles.
func NewPreviewScope(kind string) string { return kind + ":" + uuid.NewString() }

func ScopePreview(input PreviewRowsInput, scope string) PreviewRowsInput {
	input.previewScope = scope
	return input
}

// Restrict fast paging to an unambiguous, non-null single key. Other shapes
// keep explicit offset fallback rather than a cursor that could skip ties.
func PreviewPrimaryKey(kind string, columns []ColumnInfo) *ColumnInfo {
	var key *ColumnInfo
	for i := range columns {
		if columns[i].PrimaryKey {
			if key != nil {
				return nil
			}
			key = &columns[i]
		}
	}
	if key == nil || key.Nullable {
		return nil
	}
	// ClickHouse sorting keys do not prove uniqueness. Unconstrained Oracle
	// NUMBER and fractional keys do not prove exact integral cursor values.
	name := strings.ToLower(key.Type)
	switch kind {
	case KindPostgres, KindSQLite:
		// Retain the existing conservative types; another engine's numeric
		// aliases must not expand SQLite's dynamically typed eligibility.
		switch name {
		case "smallint", "integer", "bigint", "int", "int2", "int4", "int8", "text", "varchar", "character varying", "char", "character":
			return key
		case "uuid":
			if kind == KindPostgres {
				return key
			}
		}
	case KindMySQL, KindMariaDB:
		name = previewBaseType(name)
		if bits, _ := previewIntegralType(name); bits == previewIntegerBits && !strings.HasPrefix(name, "u") {
			return key
		}
		switch name {
		case "text", "varchar", "char":
			return key
		}
	case KindSQLServer:
		switch name {
		case "tinyint", "smallint", "int", "bigint", "varchar", "char", "nvarchar", "nchar":
			return key
		}
	case KindDuckDB:
		switch name {
		case "tinyint", "smallint", "integer", "bigint", "utinyint", "usmallint", "uinteger", "ubigint", "hugeint", "uhugeint", "varchar":
			return key
		}
	case KindOracle:
		if oraclePreviewInteger.MatchString(key.Type) {
			return key
		}
		switch name {
		case "varchar2", "char":
			return key
		}
	}
	return nil
}

// The digest binds the bookmark to the effective ordering/filter/page shape,
// but deliberately excludes offset and cursor so it survives Next/Previous.
func previewContext(input PreviewRowsInput, key ColumnInfo) (string, error) {
	limit, _, err := PreviewBounds(input)
	if err != nil {
		return "", err
	}
	direction := "asc"
	if input.SortDirection == "desc" {
		direction = "desc"
	}
	filters := input.Filters
	if len(filters) == 0 {
		filters = nil
	}
	shape := struct {
		Scope        string
		Schema       string
		Table        string
		Key          string
		Type         string
		Direction    string
		Sort         string
		Search       string
		SearchColumn string
		MatchCase    bool
		Limit        int64
		Filters      []PreviewFilter
	}{input.previewScope, input.Schema, input.TableID, key.Name, key.Type, direction, input.SortColumn, input.Search, input.SearchColumn, input.MatchCase, limit, filters}
	data, err := json.Marshal(shape)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:]), nil
}

// Build from backend values so a bigint beyond 2^53 never passes through a
// rounded JavaScript number. Reject oversized keys instead of growing a token.
func EncodePreviewCursor(input PreviewRowsInput, key ColumnInfo, value any) (string, error) {
	context, err := previewContext(input, key)
	if err != nil {
		return "", err
	}
	// GUI-safe integers are strings, but native floats are not evidence of an
	// exact original key. Re-encode only proven integral representations.
	if isPreviewInteger(key.Type) {
		switch number := value.(type) {
		case string:
			value = json.Number(number)
		case big.Int:
			value = &number
		case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, json.Number, *big.Int:
		default:
			return "", ErrPreviewCursor
		}
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	if len(raw) > MaxPreviewCursorBytes {
		return "", ErrPreviewCursor
	}
	if _, err := cursorValue(raw, key); err != nil {
		return "", err
	}
	data, err := json.Marshal(previewCursor{previewCursorVersion, input.TableID, key.Name, context, raw})
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(data)
	if len(encoded) > MaxPreviewCursorBytes {
		return "", ErrPreviewCursor
	}
	return encoded, nil
}

// Validate the whole envelope before binding any key; stale/malformed tokens
// must restart paging rather than become a different offset request.
func DecodePreviewCursor(input PreviewRowsInput, key ColumnInfo) (any, error) {
	if len(input.Cursor) == 0 || len(input.Cursor) > MaxPreviewCursorBytes {
		return nil, ErrPreviewCursor
	}
	data, err := base64.RawURLEncoding.DecodeString(input.Cursor)
	if err != nil {
		return nil, ErrPreviewCursor
	}
	var cursor previewCursor
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&cursor); err != nil {
		return nil, ErrPreviewCursor
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, ErrPreviewCursor
	}
	context, err := previewContext(input, key)
	if err != nil || cursor.Version != previewCursorVersion || cursor.Table != input.TableID || cursor.Column != key.Name || cursor.Context != context {
		return nil, ErrPreviewCursor
	}
	return cursorValue(cursor.Value, key)
}

// Preserve exact integer typing in the database parameter instead of decoding
// JSON numeric keys into float64 first.
func cursorValue(raw json.RawMessage, key ColumnInfo) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, ErrPreviewCursor
	}
	if bits, unsigned := previewIntegralType(key.Type); bits != 0 {
		number, ok := value.(json.Number)
		if !ok {
			return nil, ErrPreviewCursor
		}
		n, ok := new(big.Int).SetString(number.String(), 10)
		if !ok {
			return nil, ErrPreviewCursor
		}
		if bits == previewIntegerBits {
			if unsigned && n.IsUint64() {
				return n.Uint64(), nil
			}
			if !unsigned && n.IsInt64() {
				return n.Int64(), nil
			}
			return nil, ErrPreviewCursor
		}
		if unsigned {
			if n.Sign() < 0 || n.BitLen() > bits {
				return nil, ErrPreviewCursor
			}
		} else {
			bound := new(big.Int).Lsh(big.NewInt(1), uint(bits-1))
			if n.Cmp(bound) >= 0 || n.Cmp(new(big.Int).Neg(bound)) < 0 {
				return nil, ErrPreviewCursor
			}
		}
		return n, nil
	}
	text, ok := value.(string)
	if !ok {
		return nil, ErrPreviewCursor
	}
	if strings.EqualFold(key.Type, "uuid") {
		if len(text) != 36 || text[8] != '-' || text[13] != '-' || text[18] != '-' || text[23] != '-' {
			return nil, ErrPreviewCursor
		}
		if _, err := hex.DecodeString(strings.ReplaceAll(text, "-", "")); err != nil {
			return nil, ErrPreviewCursor
		}
	}
	return text, nil
}

// MySQL metadata includes display widths; they do not alter integer bounds
// or column comparison semantics. Unknown numeric shapes remain unsupported.
func previewBaseType(typeName string) string {
	name := strings.ToLower(strings.TrimSpace(typeName))
	if start := strings.IndexByte(name, '('); start >= 0 {
		end := strings.IndexByte(name[start:], ')')
		if end < 0 {
			return ""
		}
		name = name[:start] + name[start+end+1:]
	}
	return strings.TrimSpace(name)
}

func previewIntegralType(typeName string) (int, bool) {
	if oraclePreviewInteger.MatchString(typeName) {
		return previewWideIntegerBits, false
	}
	name := strings.TrimSuffix(previewBaseType(typeName), " zerofill")
	unsigned := strings.HasSuffix(name, " unsigned")
	name = strings.TrimSuffix(name, " unsigned")
	switch name {
	case "tinyint", "smallint", "mediumint", "integer", "bigint", "int", "int2", "int4", "int8":
		return previewIntegerBits, unsigned
	case "utinyint", "usmallint", "uinteger", "ubigint":
		return previewIntegerBits, true
	case "hugeint":
		return previewWideIntegerBits, false
	case "uhugeint":
		return previewWideIntegerBits, true
	}
	return 0, false
}

func isPreviewInteger(typeName string) bool {
	bits, _ := previewIntegralType(typeName)
	return bits != 0
}

// Legacy direct offsets stay available. A mismatched cursor is rejected,
// never silently interpreted as a different page under offset fallback.
func UsePreviewCursor(input PreviewRowsInput, key *ColumnInfo, offset int64) (bool, error) {
	if input.PaginationMode != "" && input.PaginationMode != PaginationAuto && input.PaginationMode != PaginationOffset {
		return false, ErrPreviewCursor
	}
	eligible := key != nil && (input.SortColumn == "" || input.SortColumn == key.Name) && input.PaginationMode != PaginationOffset && (offset == 0 || input.Cursor != "")
	if input.Cursor != "" && !eligible {
		return false, ErrPreviewCursor
	}
	return eligible, nil
}

// Finalize a seek bookmark only from admitted complete rows. Very large text
// keys fall back to ordered offsets rather than returning an invalid token.
func FinishPreview(result *QueryResult, input PreviewRowsInput, key *ColumnInfo, seek bool) *QueryResult {
	result.PaginationMode = PaginationOffset
	if !seek {
		return result
	}
	result.PaginationMode = PaginationKeyset
	if result.HasMore == nil || !*result.HasMore || len(result.Rows) == 0 {
		return result
	}
	cursor, err := EncodePreviewCursor(input, *key, result.Rows[len(result.Rows)-1][key.Name])
	if err != nil {
		result.PaginationMode = PaginationOffset
		return result
	}
	result.NextCursor = cursor
	return result
}
