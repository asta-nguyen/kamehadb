package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/internal/logs"
	"github.com/zalando/go-keyring"
)

// Byte-compatible port of apps/sidecar/src/db/mcp-credential-vault.ts:
// v1.<b64url nonce>.<b64url tag>.<b64url ciphertext>, AES-256-GCM, AAD =
// JSON [profileId, accountRef]. Ciphertexts produced by the sidecar must
// decrypt here and vice versa.
const (
	mcpKeyBytes      = 32
	mcpNonceBytes    = 12
	mcpFormatVersion = "v1"
	// Keychain service name; the account is the metadata DB path.
	mcpKeyringService = "kamehadb-mcp-vault"
)

var (
	errMCPKeyUnavailable = errors.New("Local MCP credential key is unavailable")
	errMCPKeyCreate      = errors.New("Local MCP credential key could not be created")
	errMCPKeyInvalid     = errors.New("Local MCP credential key is invalid")
	errMCPDecrypt        = errors.New("Stored MCP credential could not be decrypted")
	errMCPNotPrepared    = errors.New("Managed MCP account is not prepared")
	errSecretDecrypt     = errors.New("Stored secret could not be decrypted")
)

// Application secrets (profile passwords, credential-bearing connection
// strings, AI provider API keys) reuse the MCP vault key and AES-256-GCM but
// carry their own version tag so the two ciphertext families never collide.
// The authenticated data binds a ciphertext to its record and field, so a
// value cannot be moved to another row or column and still decrypt.
const (
	secretFormatVersion = "s1"
	secretAADDomain     = "kamehadb-secret"
)

// MCPCredentialBundle is the decrypted managed-account payload. SQL server
// kinds carry username/password; mongodb carries a connection string.
type MCPCredentialBundle struct {
	Kind             string `json:"kind"`
	Username         string `json:"username,omitempty"`
	Password         string `json:"password,omitempty"`
	ConnectionString string `json:"connectionString,omitempty"`
}

func (b MCPCredentialBundle) valid() bool {
	switch b.Kind {
	case engines.KindPostgres, engines.KindMySQL, engines.KindMariaDB, engines.KindSQLServer:
		return b.Username != "" && b.Password != "" && b.ConnectionString == ""
	case engines.KindMongoDB:
		return b.ConnectionString != "" && b.Username == "" && b.Password == ""
	}
	return false
}

// OS keychain hooks; tests swap them so unit tests never touch the real
// keychain.
var (
	keyringGet = keyring.Get
	keyringSet = keyring.Set
)

// SetKeyringHooksForTest overrides the OS keychain get/set hooks during tests and
// returns a cleanup function to restore them.
func SetKeyringHooksForTest(get func(service, user string) (string, error), set func(service, user, password string) error) func() {
	mcpKeyMu.Lock()
	origGet, origSet := keyringGet, keyringSet
	if get != nil {
		keyringGet = get
	}
	if set != nil {
		keyringSet = set
	}
	mcpKeyMu.Unlock()
	return func() {
		mcpKeyMu.Lock()
		keyringGet, keyringSet = origGet, origSet
		mcpKeyMu.Unlock()
	}
}

// mcpKeyMu serialises key lookup/creation: the keychain has no O_EXCL, so two
// concurrent first-saves could otherwise each create a different key.
var mcpKeyMu sync.Mutex

// Resolve the vault key without storing it beside SQLite, so a copy of the
// database directory alone does not expose credentials. The OS keychain is
// preferred; a legacy <dbPath>.mcp.key (0600) is moved into it on first read
// and is also the fallback when no keychain is available (e.g. headless Linux).
func readMCPKey(dbPath string, allowCreate bool) ([]byte, error) {
	mcpKeyMu.Lock()
	defer mcpKeyMu.Unlock()

	// Absolute path so a relative data dir does not change the keychain account.
	account, err := filepath.Abs(dbPath)
	if err != nil {
		account = dbPath
	}
	enc, kerr := keyringGet(mcpKeyringService, account)
	if kerr == nil {
		key, err := base64.StdEncoding.DecodeString(enc)
		if err != nil || len(key) != mcpKeyBytes {
			return nil, errMCPKeyInvalid
		}
		return key, nil
	}
	// Only ErrNotFound proves the keychain works and holds no key. Any other
	// error (locked, no dbus) means "unknown": never write to it, or a key that
	// already protects stored ciphertexts could be overwritten.
	keychainOK := errors.Is(kerr, keyring.ErrNotFound)
	save := func(key []byte) bool {
		return keychainOK && keyringSet(mcpKeyringService, account, base64.StdEncoding.EncodeToString(key)) == nil
	}

	keyPath := dbPath + ".mcp.key"
	key, err := os.ReadFile(keyPath)
	if err == nil {
		if len(key) != mcpKeyBytes {
			return nil, errMCPKeyInvalid
		}
		// Migrate: remove the file only after the keychain accepted the key.
		if save(key) {
			os.Remove(keyPath)
		}
		return key, nil
	}
	if !errors.Is(err, fs.ErrNotExist) || !allowCreate {
		return nil, errMCPKeyUnavailable
	}
	newKey := make([]byte, mcpKeyBytes)
	if _, err := rand.Read(newKey); err != nil {
		return nil, errMCPKeyCreate
	}
	if save(newKey) {
		return newKey, nil
	}
	logs.Warn("store", "OS keychain unavailable; MCP credential key kept in "+keyPath)
	f, err := os.OpenFile(keyPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return nil, errMCPKeyCreate
	}
	if _, err := f.Write(newKey); err != nil {
		f.Close()
		return nil, errMCPKeyCreate
	}
	if err := f.Close(); err != nil {
		return nil, errMCPKeyCreate
	}
	return newKey, nil
}

func mcpAAD(profileID, accountRef string) []byte {
	aad, _ := json.Marshal([]string{profileID, accountRef})
	return aad
}

// secretAAD binds a stored secret to its record and field so a ciphertext
// cannot be replayed from another row or column. (Why)
func secretAAD(recordID, field string) []byte {
	aad, _ := json.Marshal([]string{secretAADDomain, recordID, field})
	return aad
}

// sealWithKey encrypts a UTF-8 secret with an already-resolved vault key.
func sealWithKey(key, aad []byte, plaintext string) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", errMCPKeyInvalid
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, mcpNonceBytes)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nil, nonce, []byte(plaintext), aad)
	tag := sealed[len(sealed)-gcm.Overhead():]
	ciphertext := sealed[:len(sealed)-gcm.Overhead()]
	return strings.Join([]string{
		secretFormatVersion,
		base64.RawURLEncoding.EncodeToString(nonce),
		base64.RawURLEncoding.EncodeToString(tag),
		base64.RawURLEncoding.EncodeToString(ciphertext),
	}, "."), nil
}

// openWithKey authenticates before returning anything; a malformed value, wrong
// key, or swapped record all collapse to errSecretDecrypt. (Why)
func openWithKey(key, aad []byte, stored string) (string, error) {
	parts := strings.Split(stored, ".")
	if len(parts) != 4 || parts[0] != secretFormatVersion {
		return "", errSecretDecrypt
	}
	nonce, err := decodeB64URL(parts[1])
	if err != nil || len(nonce) != mcpNonceBytes {
		return "", errSecretDecrypt
	}
	tag, err := decodeB64URL(parts[2])
	if err != nil || len(tag) != 16 {
		return "", errSecretDecrypt
	}
	ciphertext, err := decodeB64URL(parts[3])
	if err != nil {
		return "", errSecretDecrypt
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", errSecretDecrypt
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", errSecretDecrypt
	}
	plaintext, err := gcm.Open(nil, nonce, append(ciphertext, tag...), aad)
	if err != nil {
		return "", errSecretDecrypt
	}
	return string(plaintext), nil
}

// hasStoredCiphertext reports whether any stored secrets or credentials exist
// in the database. When ciphertexts exist, creating a new random vault key is
// prohibited because it would split keys and orphan existing data. (What / Why)
func (s *Store) hasStoredCiphertext() (bool, error) {
	var count int64
	err := s.db.QueryRow(`
		SELECT (
			(SELECT COUNT(*) FROM connection_profiles WHERE (password IS NOT NULL AND password != '') OR (connection_string IS NOT NULL AND connection_string != '')) +
			(SELECT COUNT(*) FROM ai_provider_configs WHERE api_key IS NOT NULL AND api_key != '') +
			(SELECT COUNT(*) FROM mcp_managed_accounts WHERE credential_ciphertext IS NOT NULL AND credential_ciphertext != '')
		)
	`).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func encryptStoredSecret(dbPath string, allowCreate bool, recordID, field, plaintext string) (string, error) {
	key, err := readMCPKey(dbPath, allowCreate)
	if err != nil {
		return "", err
	}
	return sealWithKey(key, secretAAD(recordID, field), plaintext)
}

func decryptStoredSecret(dbPath, recordID, field, stored string) (string, error) {
	key, err := readMCPKey(dbPath, false)
	if err != nil {
		return "", err
	}
	return openWithKey(key, secretAAD(recordID, field), stored)
}

// encryptSecret encrypts a value only once credential storage is active.
// During the one-time migration, writes stay plaintext until
// migrateCredentialStorage converts and re-encrypts the whole table. (Why)
func (s *Store) encryptSecret(recordID, field, plaintext string) (string, error) {
	if !s.secretsEncrypted {
		return plaintext, nil
	}
	hasCiphertext, err := s.hasStoredCiphertext()
	if err != nil {
		return "", err
	}
	return encryptStoredSecret(s.path, !hasCiphertext, recordID, field, plaintext)
}

// decryptSecret reads a value according to the migration marker: before the
// marker every value is plaintext, and after it every non-empty value must be
// valid ciphertext. Once migration completes there is no plaintext fallback,
// so a decrypt failure surfaces instead of returning the raw stored bytes.
func (s *Store) decryptSecret(recordID, field, stored string) (string, error) {
	if !s.secretsEncrypted {
		return stored, nil
	}
	return decryptStoredSecret(s.path, recordID, field, stored)
}

func decodeB64URL(part string) ([]byte, error) {
	if b, err := base64.RawURLEncoding.DecodeString(part); err == nil {
		return b, nil
	}
	return base64.URLEncoding.DecodeString(part)
}

func encryptMCPCredential(dbPath, profileID, accountRef string, credential MCPCredentialBundle, allowCreateKey bool) (string, error) {
	key, err := readMCPKey(dbPath, allowCreateKey)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", errMCPKeyInvalid
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, mcpNonceBytes)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	plaintext, err := json.Marshal(credential)
	if err != nil {
		return "", err
	}
	sealed := gcm.Seal(nil, nonce, plaintext, mcpAAD(profileID, accountRef))
	ciphertext, tag := sealed[:len(sealed)-gcm.Overhead()], sealed[len(sealed)-gcm.Overhead():]
	return strings.Join([]string{
		mcpFormatVersion,
		base64.RawURLEncoding.EncodeToString(nonce),
		base64.RawURLEncoding.EncodeToString(tag),
		base64.RawURLEncoding.EncodeToString(ciphertext),
	}, "."), nil
}

// Authenticate before parsing so corrupted or swapped rows never become an
// MCP credential — any failure collapses to errMCPDecrypt like the sidecar.
func decryptMCPCredential(dbPath, profileID, accountRef, stored string) (*MCPCredentialBundle, error) {
	parts := strings.Split(stored, ".")
	if len(parts) != 4 || parts[0] != mcpFormatVersion {
		return nil, errMCPDecrypt
	}
	nonce, err := decodeB64URL(parts[1])
	if err != nil || len(nonce) != mcpNonceBytes {
		return nil, errMCPDecrypt
	}
	tag, err := decodeB64URL(parts[2])
	if err != nil || len(tag) != 16 {
		return nil, errMCPDecrypt
	}
	ciphertext, err := decodeB64URL(parts[3])
	if err != nil || len(ciphertext) == 0 {
		return nil, errMCPDecrypt
	}
	key, err := readMCPKey(dbPath, false)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, errMCPDecrypt
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, errMCPDecrypt
	}
	sealed := append(ciphertext, tag...)
	plaintext, err := gcm.Open(nil, nonce, sealed, mcpAAD(profileID, accountRef))
	if err != nil {
		return nil, errMCPDecrypt
	}
	var bundle MCPCredentialBundle
	if err := json.Unmarshal(plaintext, &bundle); err != nil || !bundle.valid() {
		return nil, errMCPDecrypt
	}
	return &bundle, nil
}

// SaveMCPManagedCredential persists the generated credential before any
// database principal is created. Refuses to replace a missing key while
// other encrypted accounts still depend on it (allowCreateKey only when
// no ciphertexts exist yet).
func (s *Store) SaveMCPManagedCredential(profileID string, credential MCPCredentialBundle) error {
	account, err := s.GetMCPManagedAccount(profileID)
	if err != nil {
		return err
	}
	if account == nil {
		return errMCPNotPrepared
	}
	hasCiphertext, err := s.hasStoredCiphertext()
	if err != nil {
		return err
	}
	ciphertext, err := encryptMCPCredential(s.path, profileID, account.AccountRef, credential, !hasCiphertext)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`UPDATE mcp_managed_accounts SET credential_ciphertext = ? WHERE profile_id = ?`,
		ciphertext, profileID)
	return err
}

func (s *Store) LoadMCPManagedCredential(profileID string) (*MCPCredentialBundle, error) {
	account, err := s.GetMCPManagedAccount(profileID)
	if err != nil || account == nil {
		return nil, err
	}
	var ciphertext *string
	if err := s.db.QueryRow(
		`SELECT credential_ciphertext FROM mcp_managed_accounts WHERE profile_id = ?`,
		profileID).Scan(&ciphertext); err != nil {
		return nil, err
	}
	if ciphertext == nil || *ciphertext == "" {
		return nil, nil
	}
	return decryptMCPCredential(s.path, profileID, account.AccountRef, *ciphertext)
}
