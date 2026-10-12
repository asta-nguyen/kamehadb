package mcp

import (
	"context"
	"errors"
	"regexp"

	mysqlerr "github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5/pgconn"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// Stable tool error codes shared with clients and tests — MCP_ERROR_CODE.
const (
	ErrInvalidArguments             = "INVALID_ARGUMENTS"
	ErrProfileNotEnabled            = "PROFILE_NOT_ENABLED"
	ErrProfileNotFound              = "PROFILE_NOT_FOUND"
	ErrManagedAccountNotReady       = "MANAGED_ACCOUNT_NOT_READY"
	ErrManagedCredentialUnavailable = "MANAGED_CREDENTIAL_UNAVAILABLE"
	ErrManagedAccountExists         = "MANAGED_ACCOUNT_EXISTS"
	ErrProvisioningFailed           = "PROVISIONING_FAILED"
	ErrRevokeFailed                 = "REVOKE_FAILED"
	ErrReadOnlyQueryRequired        = "READ_ONLY_QUERY_REQUIRED"
	ErrQueryTimeout                 = "QUERY_TIMEOUT"
	ErrTimeoutUnavailable           = "TIMEOUT_UNAVAILABLE"
	ErrBusy                         = "BUSY"
	ErrDatabaseError                = "DATABASE_ERROR"
)

// ToolError carries a stable MCP code. Messages must never include tokens or
// credentials — ToToolError redacts driver messages before they reach a client.
type ToolError struct {
	Code    string
	Message string
}

func (e *ToolError) Error() string { return e.Code + ": " + e.Message }

func newToolError(code, message string) *ToolError {
	return &ToolError{Code: code, Message: message}
}

// TimeoutUnavailableError — raised when an engine cannot apply a native
// timeout, so MCP fails closed instead of running unbounded.
type TimeoutUnavailableError struct{ Message string }

func (e *TimeoutUnavailableError) Error() string {
	if e.Message == "" {
		return "Native query timeout is not supported for this database"
	}
	return e.Message
}

// QueryTimeoutError — raised when a bounded read exceeds the MCP budget and
// the reader cancelled it.
type QueryTimeoutError struct{ Message string }

func (e *QueryTimeoutError) Error() string {
	if e.Message == "" {
		return "Query exceeded the MCP execution budget"
	}
	return e.Message
}

var (
	userinfoRe = regexp.MustCompile(`([a-zA-Z][a-zA-Z0-9+.-]*://)[^/@\s]*@`)
	passwordRe = regexp.MustCompile(`(?i)(password|pwd|passwd)\s*[=:]\s*\S+`)
)

// redactCredentials strips credential-bearing substrings from driver errors:
// userinfo in URLs (scheme://user:pass@host) and password key-values.
func redactCredentials(message string) string {
	message = userinfoRe.ReplaceAllString(message, "$1***@")
	return passwordRe.ReplaceAllString(message, "$1=***")
}

// isNativeTimeout mirrors the driver-code checks: pg 57014, mysql errno
// 3024/1969, mssql ETIMEOUT, mongo code 50 / MaxTimeMSExpired.
func isNativeTimeout(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "57014" {
		return true
	}
	var myErr *mysqlerr.MySQLError
	if errors.As(err, &myErr) && (myErr.Number == 3024 || myErr.Number == 1969) {
		return true
	}
	if mongo.IsTimeout(err) {
		return true
	}
	var mgoErr mongo.CommandError
	if errors.As(err, &mgoErr) && (mgoErr.Code == 50 || mgoErr.Name == "MaxTimeMSExpired") {
		return true
	}
	var mgoWrite mongo.WriteException
	if errors.As(err, &mgoWrite) {
		for _, we := range mgoWrite.WriteErrors {
			if we.Code == 50 {
				return true
			}
		}
	}
	return errors.Is(err, context.DeadlineExceeded)
}

// ToToolError maps reader/driver failures to the stable error contract —
// toMcpToolError. Unknown errors become DATABASE_ERROR with redaction.
func ToToolError(err error) *ToolError {
	var toolErr *ToolError
	if errors.As(err, &toolErr) {
		return toolErr
	}
	var unavail *TimeoutUnavailableError
	if errors.As(err, &unavail) {
		return newToolError(ErrTimeoutUnavailable, unavail.Error())
	}
	var timeout *QueryTimeoutError
	if errors.As(err, &timeout) || isNativeTimeout(err) {
		return newToolError(ErrQueryTimeout, "Query exceeded the 30-second MCP time budget")
	}
	return newToolError(ErrDatabaseError, redactCredentials(err.Error()))
}
