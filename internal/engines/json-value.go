package engines

import (
	"math/big"
	"strconv"
)

// JavaScript numbers cannot represent all SQL integers. Keep exact decimal
// strings beyond its safe range so copied values and primary-key edits agree.
const maxJSONSafeInteger = 1<<53 - 1

// Normalize only native integral values; floating SQL values retain the
// driver's representation rather than claiming recoverable integer precision.
func JSONSafeInteger(value any) any {
	switch number := value.(type) {
	case int64:
		if number > maxJSONSafeInteger || number < -maxJSONSafeInteger {
			return strconv.FormatInt(number, 10)
		}
	case uint64:
		if number > maxJSONSafeInteger {
			return strconv.FormatUint(number, 10)
		}
	case *big.Int:
		if number == nil {
			return nil
		}
		if number.IsInt64() {
			return JSONSafeInteger(number.Int64())
		}
		return number.String()
	case big.Int:
		return JSONSafeInteger(&number)
	}
	return value
}
