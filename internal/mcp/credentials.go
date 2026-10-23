package mcp

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/url"
	"regexp"
	"strings"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

const (
	generatedPasswordBytes  = 32
	sqlUsernameHashLength   = 24
	mysqlUsernameHashLength = 25
	mongoUsernameHashLength = 24
	mysqlAccountHost        = "%"
)

// AccountOperationError mirrors McpAccountOperationError: cleanupFailed marks
// partial-database-write failures that need explicit recovery; databaseCode
// carries engine error codes for logs.
type AccountOperationError struct {
	Message       string
	CleanupFailed bool
	DatabaseCode  string
}

func (e *AccountOperationError) Error() string { return e.Message }

func opError(message string) *AccountOperationError {
	return &AccountOperationError{Message: message}
}

// PrepareVerifyFailed signals a stored credential failing verification.
var PrepareVerifyFailed = &AccountOperationError{Message: "Stored MCP credential could not be verified"}

func requireDatabase(profile *store.Profile) (string, error) {
	if profile.Database == nil || *profile.Database == "" {
		return "", opError("Select a database before creating an MCP account")
	}
	return *profile.Database, nil
}

// generatedUsername is a deterministic, per-accountRef name — reruns don't
// collide with user accounts.
func generatedUsername(kind, accountRef string) (string, error) {
	sum := sha256.Sum256([]byte(accountRef))
	digest := hex.EncodeToString(sum[:])
	const prefix = "kdbmcp_"
	switch kind {
	case engines.KindPostgres, engines.KindSQLServer:
		return prefix + digest[:sqlUsernameHashLength], nil
	case engines.KindMySQL, engines.KindMariaDB:
		return prefix + digest[:mysqlUsernameHashLength], nil
	case engines.KindMongoDB:
		return prefix + digest[:mongoUsernameHashLength], nil
	}
	return "", opError("This database does not use a managed MCP account")
}

var mongoURIRe = regexp.MustCompile(`(?i)^(mongodb(?:\+srv)?://)([^/?#]*)(/[^?#]*)?(\?[^#]*)?(#.*)?$`)

type parsedMongoURI struct {
	protocol string
	hosts    string
	path     string
	search   url.Values
	fragment string
	username string
	password string
}

// parseMongoURI preserves multi-host authorities while separating userinfo
// from query options.
func parseMongoURI(uri string) (*parsedMongoURI, error) {
	match := mongoURIRe.FindStringSubmatch(uri)
	if match == nil {
		return nil, opError("MongoDB connection string could not be prepared safely")
	}
	authority := match[2]
	at := strings.LastIndex(authority, "@")
	userInfo := ""
	if at >= 0 {
		userInfo = authority[:at]
	}
	userSplit := strings.Index(userInfo, ":")
	var username, password string
	var err error
	if userSplit < 0 {
		if username, err = url.QueryUnescape(userInfo); err != nil {
			return nil, opError("MongoDB connection string could not be prepared safely")
		}
	} else {
		if username, err = url.QueryUnescape(userInfo[:userSplit]); err != nil {
			return nil, opError("MongoDB connection string could not be prepared safely")
		}
		if password, err = url.QueryUnescape(userInfo[userSplit+1:]); err != nil {
			return nil, opError("MongoDB connection string could not be prepared safely")
		}
	}
	search := url.Values{}
	if match[4] != "" {
		if parsed, perr := url.ParseQuery(match[4][1:]); perr == nil {
			search = parsed
		}
	}
	return &parsedMongoURI{
		protocol: match[1],
		hosts:    authority[max(0, at+1):],
		path:     match[3],
		search:   search,
		fragment: match[5],
		username: username,
		password: password,
	}, nil
}

// mongoURI rebuilds a connection string with new credentials and authSource.
func mongoURI(uri string, username *string, password string, authSource string) (string, error) {
	match := mongoURIRe.FindStringSubmatch(uri)
	if match == nil {
		return "", opError("MongoDB connection string could not be prepared safely")
	}
	parsed, err := parseMongoURI(uri)
	if err != nil {
		return "", err
	}
	if authSource != "" {
		parsed.search.Set("authSource", authSource)
	}
	userInfo := ""
	if username != nil {
		userInfo = url.QueryEscape(*username) + ":" + url.QueryEscape(password) + "@"
	}
	search := parsed.search.Encode()
	out := parsed.protocol + userInfo + parsed.hosts + parsed.path
	if search != "" {
		out += "?" + search
	}
	return out + parsed.fragment, nil
}

// IsManagedCredentialForProfile verifies a decrypted bundle actually belongs
// to the profile/accountRef pair — isMcpManagedCredentialForProfile.
func IsManagedCredentialForProfile(profile *store.Profile, accountRef string, credential *store.MCPCredentialBundle) bool {
	if credential == nil || credential.Kind != profile.Kind {
		return false
	}
	username, err := generatedUsername(profile.Kind, accountRef)
	if err != nil {
		return false
	}
	if credential.Kind != engines.KindMongoDB {
		return credential.Username == username
	}
	if profile.ConnectionString == nil || profile.Database == nil || *profile.Database == "" {
		return false
	}
	actual, err := parseMongoURI(credential.ConnectionString)
	if err != nil || actual.username != username || actual.password == "" {
		return false
	}
	expected, err := mongoURI(*profile.ConnectionString, &actual.username, actual.password, *profile.Database)
	return err == nil && expected == credential.ConnectionString
}

func randomToken(bytes int) (string, error) {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// PrepareAccount generates the managed credential bundle — prepareMcpAccount.
func PrepareAccount(profile *store.Profile, accountRef string) (*store.MCPCredentialBundle, error) {
	if profile.Kind == engines.KindMongoDB {
		if profile.ConnectionString == nil || *profile.ConnectionString == "" {
			return nil, opError("MongoDB connection string is required")
		}
		database, err := requireDatabase(profile)
		if err != nil {
			return nil, err
		}
		username, err := generatedUsername(profile.Kind, accountRef)
		if err != nil {
			return nil, err
		}
		password, err := randomToken(generatedPasswordBytes)
		if err != nil {
			return nil, err
		}
		connStr, err := mongoURI(*profile.ConnectionString, &username, password, database)
		if err != nil {
			return nil, err
		}
		return &store.MCPCredentialBundle{Kind: engines.KindMongoDB, ConnectionString: connStr}, nil
	}
	switch profile.Kind {
	case engines.KindPostgres, engines.KindMySQL, engines.KindMariaDB, engines.KindSQLServer:
		username, err := generatedUsername(profile.Kind, accountRef)
		if err != nil {
			return nil, err
		}
		password, err := randomToken(generatedPasswordBytes)
		if err != nil {
			return nil, err
		}
		return &store.MCPCredentialBundle{Kind: profile.Kind, Username: username, Password: password}, nil
	}
	return nil, opError("This database does not use a managed MCP account")
}
