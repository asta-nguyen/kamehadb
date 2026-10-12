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
	"strings"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

// Byte-compatible port of apps/sidecar/src/db/mcp-credential-vault.ts:
// v1.<b64url nonce>.<b64url tag>.<b64url ciphertext>, AES-256-GCM, AAD =
// JSON [profileId, accountRef]. Ciphertexts produced by the sidecar must
// decrypt here and vice versa.
const (
	mcpKeyBytes      = 32
	mcpNonceBytes    = 12
	mcpFormatVersion = "v1"
)

var (
	errMCPKeyUnavailable = errors.New("Local MCP credential key is unavailable")
	errMCPKeyCreate      = errors.New("Local MCP credential key could not be created")
	errMCPKeyInvalid     = errors.New("Local MCP credential key is invalid")
	errMCPDecrypt        = errors.New("Stored MCP credential could not be decrypted")
	errMCPNotPrepared    = errors.New("Managed MCP account is not prepared")
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

// Keep the key outside SQLite so a copy of the database alone does not
// expose credentials (same layout as the sidecar: <dbPath>.mcp.key, 0600).
func readMCPKey(dbPath string, allowCreate bool) ([]byte, error) {
	keyPath := dbPath + ".mcp.key"
	key, err := os.ReadFile(keyPath)
	if err != nil {
		if !errors.Is(err, fs.ErrNotExist) || !allowCreate {
			return nil, errMCPKeyUnavailable
		}
		newKey := make([]byte, mcpKeyBytes)
		if _, err := rand.Read(newKey); err != nil {
			return nil, errMCPKeyCreate
		}
		// O_EXCL mirrors the 'wx' flag: a loser of a create race re-reads.
		f, werr := os.OpenFile(keyPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if werr != nil {
			if !errors.Is(werr, fs.ErrExist) {
				return nil, errMCPKeyCreate
			}
		} else {
			if _, werr := f.Write(newKey); werr != nil {
				f.Close()
				return nil, errMCPKeyCreate
			}
			if werr := f.Close(); werr != nil {
				return nil, errMCPKeyCreate
			}
		}
		key, err = os.ReadFile(keyPath)
		if err != nil {
			return nil, errMCPKeyUnavailable
		}
	}
	if len(key) != mcpKeyBytes {
		return nil, errMCPKeyInvalid
	}
	return key, nil
}

func mcpAAD(profileID, accountRef string) []byte {
	aad, _ := json.Marshal([]string{profileID, accountRef})
	return aad
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
	var existing int64
	if err := s.db.QueryRow(
		`SELECT COUNT(*) FROM mcp_managed_accounts WHERE credential_ciphertext IS NOT NULL`,
	).Scan(&existing); err != nil {
		return err
	}
	ciphertext, err := encryptMCPCredential(s.path, profileID, account.AccountRef, credential, existing == 0)
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
