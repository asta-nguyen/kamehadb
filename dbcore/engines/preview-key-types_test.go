package engines

import (
	"errors"
	"math"
	"math/big"
	"reflect"
	"testing"
)

// Keys stay exact both in cells and in native parameters; a float or an
// unsupported metadata shape must not silently qualify for seek paging.
func TestAdditionalPreviewExactKeys(t *testing.T) {
	wide, _ := new(big.Int).SetString("170141183460469231731687303715884105727", 10)
	unsignedWide, _ := new(big.Int).SetString("340282366920938463463374607431768211455", 10)
	oracleWide, _ := new(big.Int).SetString("99999999999999999999999999999999999999", 10)
	for _, test := range []struct {
		kind, dataType string
		value, want    any
	}{
		{KindMySQL, "bigint unsigned", "18446744073709551615", uint64(math.MaxUint64)},
		{KindMariaDB, "bigint(20) unsigned", uint64(math.MaxUint64), uint64(math.MaxUint64)},
		{KindMySQL, "mediumint(8) unsigned", int64(16777215), uint64(16777215)},
		{KindMySQL, "varchar(255)", "日本語' OR 1=1 --", "日本語' OR 1=1 --"},
		{KindSQLServer, "tinyint", int64(255), int64(255)},
		{KindSQLServer, "nvarchar", "trailing ", "trailing "},
		{KindOracle, "VARCHAR2", "mixed case", "mixed case"},
		{KindOracle, "NUMBER(38,0)", oracleWide.String(), oracleWide},
		{KindDuckDB, "UBIGINT", uint64(math.MaxUint64), uint64(math.MaxUint64)},
		{KindDuckDB, "HUGEINT", wide, wide},
		{KindDuckDB, "UHUGEINT", unsignedWide, unsignedWide},
	} {
		t.Run(test.kind+"/"+test.dataType, func(t *testing.T) {
			key := ColumnInfo{Name: "id", Type: test.dataType, PrimaryKey: true}
			if PreviewPrimaryKey(test.kind, []ColumnInfo{key}) == nil {
				t.Fatal("exact supported key rejected")
			}
			input := PreviewRowsInput{TableID: "fixture"}
			cursor, err := EncodePreviewCursor(input, key, test.value)
			if err != nil {
				t.Fatal(err)
			}
			input.Cursor = cursor
			got, err := DecodePreviewCursor(input, key)
			if err != nil || !reflect.DeepEqual(got, test.want) {
				t.Fatalf("got %T %v, want %T %v: %v", got, got, test.want, test.want, err)
			}
		})
	}
}

func TestAdditionalPreviewUnknownKeysAndLossyValues(t *testing.T) {
	for _, test := range []struct{ kind, dataType string }{
		{KindClickHouse, "integer"},
		{KindMySQL, "decimal(20,0)"},
		{KindSQLServer, "uniqueidentifier"},
		{KindOracle, "NUMBER"},
		{KindOracle, "NUMBER(38,2)"},
		{KindOracle, "NUMBER(39,0)"},
		{KindOracle, "NUMBER(*,0)"},
		{KindDuckDB, "DECIMAL(38,0)"},
		{KindDuckDB, "DOUBLE"},
	} {
		if PreviewPrimaryKey(test.kind, []ColumnInfo{{Name: "id", Type: test.dataType, PrimaryKey: true}}) != nil {
			t.Fatal("unknown representation qualified", test)
		}
	}
	for _, test := range []struct {
		dataType string
		value    any
	}{
		{"bigint", float64(9007199254740992)},
		{"bigint unsigned", "-1"},
		{"UBIGINT", "18446744073709551616"},
		{"HUGEINT", "170141183460469231731687303715884105728"},
		{"UHUGEINT", "340282366920938463463374607431768211456"},
	} {
		_, err := EncodePreviewCursor(PreviewRowsInput{TableID: "fixture"}, ColumnInfo{Name: "id", Type: test.dataType}, test.value)
		if !errors.Is(err, ErrPreviewCursor) {
			t.Fatal("lossy/out-of-range key accepted", test, err)
		}
	}
}

func TestWideIntegersAreSafeAtGUIBoundary(t *testing.T) {
	value, _ := new(big.Int).SetString("170141183460469231731687303715884105727", 10)
	if got := JSONSafeInteger(value); got != value.String() {
		t.Fatal("wide native integer would become a rounded JS number", got)
	}
	if got := JSONSafeInteger(big.NewInt(42)); got != int64(42) {
		t.Fatal("safe integer representation changed", got)
	}
}
