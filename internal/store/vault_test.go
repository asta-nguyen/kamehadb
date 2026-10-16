package store

import (
	"bytes"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/zalando/go-keyring"
)

// Fixture produced by Node's crypto implementing the sidecar's exact
// mcp-credential-vault.ts algorithm — proves byte-compatibility on real
// sidecar output, not just self-consistency.
const (
	fixtureKeyHex    = "6ca3a7846fe3737f9aeedba66274707f9ed192f6699833733f698cc7452f549a"
	fixtureStored    = "v1.mCOi9WLIvyzY4hPQ.nvvbEJxPt2LzOVrhZyQi4g.1VfU-mc79ow3TY2CLKczywe_MYEI0j5BowB0DmSboWAmJhW6bY4fcLMNYtjMjECy4FNu7RHmderfKDKnfXjJ"
	fixtureProfileID = "prof-1734"
	fixtureAccount   = "mcp_acc_9f2e"
)

func writeFixtureKey(t *testing.T, dbPath string) {
	t.Helper()
	key, err := hex.DecodeString(fixtureKeyHex)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dbPath+".mcp.key", key, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestDecryptNodeCiphertext(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "meta.db")
	writeFixtureKey(t, dbPath)

	bundle, err := decryptMCPCredential(dbPath, fixtureProfileID, fixtureAccount, fixtureStored)
	if err != nil {
		t.Fatalf("node ciphertext failed to decrypt: %v", err)
	}
	if bundle.Kind != "postgres" || bundle.Username != "kameha_ro" || bundle.Password != "s3cret!" {
		t.Fatalf("wrong bundle: %+v", bundle)
	}
}

func TestDecryptFailsClosed(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "meta.db")
	writeFixtureKey(t, dbPath)

	cases := map[string]struct {
		profileID, accountRef, stored string
	}{
		"wrong accountRef": {fixtureProfileID, "other_ref", fixtureStored},
		"wrong profileId":  {"other_prof", fixtureAccount, fixtureStored},
		"bad version":      {fixtureProfileID, fixtureAccount, "v2." + fixtureStored[3:]},
		"extra part":       {fixtureProfileID, fixtureAccount, fixtureStored + ".x"},
		"missing part":     {fixtureProfileID, fixtureAccount, "v1.abc.def"},
		"tampered ct":      {fixtureProfileID, fixtureAccount, fixtureStored[:len(fixtureStored)-2] + "zz"},
		"garbage":          {fixtureProfileID, fixtureAccount, "not-a-credential"},
	}
	for name, c := range cases {
		if _, err := decryptMCPCredential(dbPath, c.profileID, c.accountRef, c.stored); !errors.Is(err, errMCPDecrypt) {
			t.Errorf("%s: expected errMCPDecrypt, got %v", name, err)
		}
	}

	// Missing key → unavailable (not a decrypt error)
	os.Remove(dbPath + ".mcp.key")
	if _, err := decryptMCPCredential(dbPath, fixtureProfileID, fixtureAccount, fixtureStored); !errors.Is(err, errMCPKeyUnavailable) {
		t.Errorf("missing key: expected errMCPKeyUnavailable, got %v", err)
	}
}

// Application secrets are bound to their record and field, so a ciphertext
// moved to another row or column must fail rather than decrypt. (What / Why)
func TestStoredSecretBindsRecordAndField(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "meta.db")
	ciphertext, err := encryptStoredSecret(dbPath, "p1", "password", "secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decryptStoredSecret(dbPath, "p1", "password", ciphertext); err != nil {
		t.Fatalf("round-trip: %v", err)
	}
	if _, err := decryptStoredSecret(dbPath, "p1", "connection_string", ciphertext); !errors.Is(err, errSecretDecrypt) {
		t.Errorf("moved field: expected errSecretDecrypt, got %v", err)
	}
	if _, err := decryptStoredSecret(dbPath, "p2", "password", ciphertext); !errors.Is(err, errSecretDecrypt) {
		t.Errorf("moved record: expected errSecretDecrypt, got %v", err)
	}
	if _, err := decryptStoredSecret(dbPath, "p1", "password", "not-a-ciphertext"); !errors.Is(err, errSecretDecrypt) {
		t.Errorf("garbage: expected errSecretDecrypt, got %v", err)
	}
}

func TestRoundTripAndKeyLifecycle(t *testing.T) {
	s := openTemp(t)
	dbPath := s.Path()
	keyPath := dbPath + ".mcp.key"

	// Unprepared account can't save.
	err := s.SaveMCPManagedCredential("nobody", MCPCredentialBundle{Kind: "postgres", Username: "u", Password: "p"})
	if !errors.Is(err, errMCPNotPrepared) {
		t.Fatalf("expected errMCPNotPrepared, got %v", err)
	}

	if _, err := s.CreateMCPManagedAccount("p1", "ref-1"); err != nil {
		t.Fatal(err)
	}
	cred := MCPCredentialBundle{Kind: "postgres", Username: "kameha_ro", Password: "pw"}
	if err := s.SaveMCPManagedCredential("p1", cred); err != nil {
		t.Fatal(err)
	}

	// Key file created with owner-only perms.
	fi, err := os.Stat(keyPath)
	if err != nil {
		t.Fatal("key file not created")
	}
	if fi.Mode().Perm() != 0o600 {
		t.Errorf("key mode = %o, want 600", fi.Mode().Perm())
	}
	if fi.Size() != 32 {
		t.Errorf("key size = %d, want 32", fi.Size())
	}

	got, err := s.LoadMCPManagedCredential("p1")
	if err != nil || got == nil || *got != cred {
		t.Fatalf("round-trip: %+v %v", got, err)
	}

	// Go format: v1 + 3 b64url parts, parseable shape.
	var stored string
	if err := s.db.QueryRow(`SELECT credential_ciphertext FROM mcp_managed_accounts WHERE profile_id = 'p1'`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	parts := 0
	for i := 0; i < len(stored); i++ {
		if stored[i] == '.' {
			parts++
		}
	}
	if stored[:3] != "v1." || parts != 3 {
		t.Errorf("malformed ciphertext: %q", stored)
	}

	// Missing key + existing ciphertext → save must NOT recreate the key.
	os.Remove(keyPath)
	if _, err := s.CreateMCPManagedAccount("p2", "ref-2"); err != nil {
		t.Fatal(err)
	}
	err = s.SaveMCPManagedCredential("p2", cred)
	if !errors.Is(err, errMCPKeyUnavailable) {
		t.Fatalf("expected errMCPKeyUnavailable, got %v", err)
	}
	if _, err := os.Stat(keyPath); err == nil {
		t.Error("key was recreated despite existing ciphertexts")
	}

	// Mongo bundle shape validates.
	bundle, err := decryptMCPCredential(dbPath, "x", "y", "v1.AA.AA.AA")
	_ = bundle
	_ = err // already covered; mongo validation checked via valid()
	m := MCPCredentialBundle{Kind: "mongodb", ConnectionString: "mongodb://x"}
	if !m.valid() {
		t.Error("mongo bundle should be valid")
	}
	if (MCPCredentialBundle{Kind: "mongodb", ConnectionString: "x", Username: "u"}).valid() {
		t.Error("mongo bundle with username should be invalid")
	}
	if (MCPCredentialBundle{Kind: "postgres", Username: "", Password: "p"}).valid() {
		t.Error("empty username should be invalid")
	}
	if (MCPCredentialBundle{Kind: "sqlite", Username: "u", Password: "p"}).valid() {
		t.Error("sqlite is not an MCP kind")
	}
}

// Existing tests exercise the file fallback, so the keychain is "unavailable"
// by default; keychain tests install withMemoryKeyring.
func TestMain(m *testing.M) {
	keyringGet = func(string, string) (string, error) { return "", keyring.ErrNotFound }
	keyringSet = func(string, string, string) error { return errors.New("no keychain") }
	os.Exit(m.Run())
}

func withMemoryKeyring(t *testing.T) map[string]string {
	t.Helper()
	mem := map[string]string{}
	keyringGet = func(_, acct string) (string, error) {
		if v, ok := mem[acct]; ok {
			return v, nil
		}
		return "", keyring.ErrNotFound
	}
	keyringSet = func(_, acct, v string) error { mem[acct] = v; return nil }
	t.Cleanup(func() {
		keyringGet = func(string, string) (string, error) { return "", keyring.ErrNotFound }
		keyringSet = func(string, string, string) error { return errors.New("no keychain") }
	})
	return mem
}

func TestKeyCreatedInKeychainNotFile(t *testing.T) {
	mem := withMemoryKeyring(t)
	dbPath := filepath.Join(t.TempDir(), "meta.db")

	key, err := readMCPKey(dbPath, true)
	if err != nil || len(key) != mcpKeyBytes {
		t.Fatalf("create: %v len=%d", err, len(key))
	}
	if _, ok := mem[dbPath]; !ok {
		t.Error("key not stored in keychain")
	}
	if _, err := os.Stat(dbPath + ".mcp.key"); err == nil {
		t.Error("key file written despite keychain being available")
	}
	again, err := readMCPKey(dbPath, false)
	if err != nil || !bytes.Equal(again, key) {
		t.Errorf("second read differs: %v", err)
	}
}

func TestLegacyKeyFileMigratesToKeychain(t *testing.T) {
	mem := withMemoryKeyring(t)
	dbPath := filepath.Join(t.TempDir(), "meta.db")
	writeFixtureKey(t, dbPath)

	// Fixture ciphertext must still decrypt after the key moves.
	if _, err := decryptMCPCredential(dbPath, fixtureProfileID, fixtureAccount, fixtureStored); err != nil {
		t.Fatalf("decrypt after migrate: %v", err)
	}
	if _, ok := mem[dbPath]; !ok {
		t.Error("key not moved into keychain")
	}
	if _, err := os.Stat(dbPath + ".mcp.key"); err == nil {
		t.Error("legacy key file not removed after migration")
	}
}

// A keychain error other than "not found" (locked, no dbus) must never be
// written to: it could already hold the key protecting stored ciphertexts.
func TestKeychainErrorDoesNotOverwrite(t *testing.T) {
	sets := 0
	keyringGet = func(string, string) (string, error) { return "", errors.New("keychain locked") }
	keyringSet = func(string, string, string) error { sets++; return nil }
	t.Cleanup(func() {
		keyringGet = func(string, string) (string, error) { return "", keyring.ErrNotFound }
		keyringSet = func(string, string, string) error { return errors.New("no keychain") }
	})
	dbPath := filepath.Join(t.TempDir(), "meta.db")

	if _, err := readMCPKey(dbPath, true); err != nil {
		t.Fatal(err)
	}
	if sets != 0 {
		t.Errorf("keychain written %d times despite lookup error", sets)
	}
	if _, err := os.Stat(dbPath + ".mcp.key"); err != nil {
		t.Error("expected file fallback key")
	}
}
