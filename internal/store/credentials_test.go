package store

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// resetAICache clears the package-level AI settings cache so a test observes
// the database rather than another test's cached snapshot. (Why)
func resetAICache() {
	aiSettingsCache.Lock()
	aiSettingsCache.settings = nil
	aiSettingsCache.expires = time.Time{}
	aiSettingsCache.Unlock()
}

// seedLegacyPlaintext creates the full schema, then removes the migration
// marker and writes plaintext secrets directly so the next Open exercises the
// credential migration path. (How / Why)
func seedLegacyPlaintext(t *testing.T, path string) {
	t.Helper()
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := s.DB().Exec(`DELETE FROM ai_settings WHERE key = ?`, credentialMarkerKey); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB().Exec(`INSERT INTO connection_profiles (id, name, kind, password, connection_string)
		VALUES ('p1', 'Legacy', 'postgres', 'pw-plain', 'postgres://u:p@h/db')`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB().Exec(`UPDATE ai_provider_configs SET api_key = 'sk-plain' WHERE provider = 'openai'`); err != nil {
		t.Fatal(err)
	}
}

// Migration must encrypt profile passwords, connection strings, and provider
// API keys while every accessor still returns the original plaintext. (What / Why)
func TestCredentialMigrationEncryptsAndRoundTrips(t *testing.T) {
	resetAICache()
	path := filepath.Join(t.TempDir(), "kamehadb.db")
	seedLegacyPlaintext(t, path)

	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	if pw, err := s.GetProfilePassword("p1"); err != nil || pw != "pw-plain" {
		t.Fatalf("password round-trip: %q %v", pw, err)
	}
	p, err := s.GetProfile("p1")
	if err != nil || p == nil || p.ConnectionString == nil || *p.ConnectionString != "postgres://u:p@h/db" {
		t.Fatalf("connection string round-trip: %+v %v", p, err)
	}
	settings, err := s.GetAISettings()
	if err != nil {
		t.Fatal(err)
	}
	if got := settings.Providers["openai"].APIKey; got != "sk-plain" {
		t.Fatalf("api key round-trip: %q", got)
	}

	var storedPw, storedCS, storedKey, marker string
	if err := s.DB().QueryRow(
		`SELECT password, connection_string FROM connection_profiles WHERE id = 'p1'`).Scan(&storedPw, &storedCS); err != nil {
		t.Fatal(err)
	}
	if err := s.DB().QueryRow(
		`SELECT api_key FROM ai_provider_configs WHERE provider = 'openai'`).Scan(&storedKey); err != nil {
		t.Fatal(err)
	}
	if err := s.DB().QueryRow(
		`SELECT value FROM ai_settings WHERE key = ?`, credentialMarkerKey).Scan(&marker); err != nil {
		t.Fatal(err)
	}
	if marker != credentialMarkerVersion {
		t.Errorf("marker = %q, want %q", marker, credentialMarkerVersion)
	}
	for name, value := range map[string]string{
		"password": storedPw, "connection_string": storedCS, "api_key": storedKey,
	} {
		if !strings.HasPrefix(value, secretFormatVersion+".") {
			t.Errorf("%s is not ciphertext: %q", name, value)
		}
		if strings.Contains(value, "plain") {
			t.Errorf("%s leaked plaintext: %q", name, value)
		}
	}
}

// A legacy plaintext secret that begins with the ciphertext prefix must still
// be treated as plaintext: absence of the marker, not the prefix, selects the
// plaintext path. (What / Why)
func TestCredentialMigrationTreatsPrefixLookalikeAsPlaintext(t *testing.T) {
	const lookalike = "s1.this-is-a-legacy-plaintext-secret"
	path := filepath.Join(t.TempDir(), "kamehadb.db")

	s0, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s0.DB().Exec(`DELETE FROM ai_settings WHERE key = ?`, credentialMarkerKey); err != nil {
		t.Fatal(err)
	}
	if _, err := s0.DB().Exec(
		`INSERT INTO connection_profiles (id, name, kind, password) VALUES ('p1', 'Legacy', 'postgres', ?)`,
		lookalike); err != nil {
		t.Fatal(err)
	}
	s0.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if pw, err := s.GetProfilePassword("p1"); err != nil || pw != lookalike {
		t.Fatalf("lookalike round-trip: %q %v", pw, err)
	}
}

// The vault key must come from the keychain when available and from the
// owner-only key file otherwise. (What / Why)
func TestCredentialMigrationKeyStorage(t *testing.T) {
	t.Run("keychain", func(t *testing.T) {
		mem := withMemoryKeyring(t)
		path := filepath.Join(t.TempDir(), "kamehadb.db")
		seedLegacyPlaintext(t, path)

		s, err := Open(path)
		if err != nil {
			t.Fatal(err)
		}
		defer s.Close()
		if _, ok := mem[path]; !ok {
			t.Error("key not stored in keychain")
		}
		if _, err := os.Stat(path + ".mcp.key"); err == nil {
			t.Error("key file written despite keychain being available")
		}
		if pw, _ := s.GetProfilePassword("p1"); pw != "pw-plain" {
			t.Errorf("password = %q", pw)
		}
	})

	t.Run("file fallback", func(t *testing.T) {
		// TestMain keeps the keychain unavailable, forcing the file fallback.
		path := filepath.Join(t.TempDir(), "kamehadb.db")
		seedLegacyPlaintext(t, path)

		s, err := Open(path)
		if err != nil {
			t.Fatal(err)
		}
		defer s.Close()
		if _, err := os.Stat(path + ".mcp.key"); err != nil {
			t.Error("expected the owner-only key file fallback")
		}
		if pw, _ := s.GetProfilePassword("p1"); pw != "pw-plain" {
			t.Errorf("password = %q", pw)
		}
	})
}

// An unreachable key (locked keychain, unusable file fallback) must fail the
// migration rather than store or return plaintext, and must leave the original
// plaintext rows intact with no marker. (What / Why)
func TestCredentialMigrationFailurePreservesPlaintext(t *testing.T) {
	path := filepath.Join(t.TempDir(), "kamehadb.db")
	seedLegacyPlaintext(t, path)

	origGet, origSet := keyringGet, keyringSet
	t.Cleanup(func() { keyringGet, keyringSet = origGet, origSet })
	keyringGet = func(string, string) (string, error) { return "", errors.New("keychain locked") }
	keyringSet = func(string, string, string) error { return errors.New("keychain locked") }
	// A directory where the key file should be makes the file fallback unusable.
	if err := os.Mkdir(path+".mcp.key", 0o700); err != nil {
		t.Fatal(err)
	}

	if _, err := Open(path); err == nil {
		t.Fatal("Open should fail when the vault key is unreachable")
	}

	raw, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	var pw, apiKey string
	var markers int
	if err := raw.QueryRow(`SELECT password FROM connection_profiles WHERE id = 'p1'`).Scan(&pw); err != nil {
		t.Fatal(err)
	}
	if err := raw.QueryRow(`SELECT api_key FROM ai_provider_configs WHERE provider = 'openai'`).Scan(&apiKey); err != nil {
		t.Fatal(err)
	}
	if err := raw.QueryRow(`SELECT COUNT(*) FROM ai_settings WHERE key = ?`, credentialMarkerKey).Scan(&markers); err != nil {
		t.Fatal(err)
	}
	if pw != "pw-plain" {
		t.Errorf("password changed on failed migration: %q", pw)
	}
	if apiKey != "sk-plain" {
		t.Errorf("api key changed on failed migration: %q", apiKey)
	}
	if markers != 0 {
		t.Error("marker must not be set after a failed migration")
	}
}

// A value whose vault key is gone must surface an error, never the raw stored
// bytes, once the marker is set. (What / Why)
func TestDecryptRequiresKeyAfterMigration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "kamehadb.db")
	seedLegacyPlaintext(t, path)
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := s.GetProfilePassword("p1"); err != nil {
		t.Fatalf("seeded decrypt: %v", err)
	}

	// Remove the key and lock the keychain: the accessor must fail closed.
	os.Remove(path + ".mcp.key")
	origGet, origSet := keyringGet, keyringSet
	t.Cleanup(func() { keyringGet, keyringSet = origGet, origSet })
	keyringGet = func(string, string) (string, error) { return "", errors.New("keychain locked") }
	keyringSet = func(string, string, string) error { return errors.New("keychain locked") }

	if pw, err := s.GetProfilePassword("p1"); err == nil || pw != "" {
		t.Fatalf("expected a hard failure, got pw=%q err=%v", pw, err)
	}
}

// Newly created profiles and provider keys are stored as ciphertext while the
// accessors return the plaintext. (What / Why)
func TestNewSecretsAreEncryptedAtRest(t *testing.T) {
	resetAICache()
	s := openTemp(t)
	name, kind, pw, conn := "pg", "postgres", "fresh-pw", "postgres://u:p@h/db"
	if _, err := s.CreateProfile(ProfileInput{
		Name: &name, Kind: &kind, Password: &pw, ConnectionString: &conn,
	}); err != nil {
		t.Fatal(err)
	}

	settings, err := s.GetAISettings()
	if err != nil {
		t.Fatal(err)
	}
	cfg := settings.Providers["openai"]
	cfg.APIKey = "fresh-key"
	settings.Providers["openai"] = cfg
	if err := s.SaveAISettings(*settings); err != nil {
		t.Fatal(err)
	}

	var storedPw, storedKey string
	if err := s.DB().QueryRow(
		`SELECT password FROM connection_profiles WHERE name = 'pg'`).Scan(&storedPw); err != nil {
		t.Fatal(err)
	}
	if err := s.DB().QueryRow(
		`SELECT api_key FROM ai_provider_configs WHERE provider = 'openai'`).Scan(&storedKey); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(storedPw, secretFormatVersion+".") {
		t.Errorf("password not encrypted: %q", storedPw)
	}
	if !strings.HasPrefix(storedKey, secretFormatVersion+".") {
		t.Errorf("api key not encrypted: %q", storedKey)
	}

	got, err := s.GetAISettings()
	if err != nil {
		t.Fatal(err)
	}
	if got.Providers["openai"].APIKey != "fresh-key" {
		t.Errorf("api key round-trip: %q", got.Providers["openai"].APIKey)
	}
}

// On POSIX the metadata directory is owner-only and the database is owner
// read/write; Windows ACLs are left alone. (What / Why)
func TestOpenRestrictsMetadataPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX-only permission assertions")
	}
	dir := filepath.Join(t.TempDir(), "meta")
	s, err := Open(filepath.Join(dir, "kamehadb.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	di, err := os.Stat(dir)
	if err != nil {
		t.Fatal(err)
	}
	if di.Mode().Perm() != 0o700 {
		t.Errorf("directory mode = %o, want 700", di.Mode().Perm())
	}
	fi, err := os.Stat(s.Path())
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode().Perm() != 0o600 {
		t.Errorf("database mode = %o, want 600", fi.Mode().Perm())
	}
}
