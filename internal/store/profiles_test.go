package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"testing"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

// Empty lists must cross Wails as arrays so a fresh or emptied workspace can
// render the welcome screen without treating JSON null as a profile list.
func TestListProfilesEmptyJSON(t *testing.T) {
	for _, afterDelete := range []bool{false, true} {
		name := "fresh"
		if afterDelete {
			name = "after deleting last profile"
		}
		t.Run(name, func(t *testing.T) {
			s := openTemp(t)
			if afterDelete {
				profileName, kind := "fixture", engines.KindSQLite
				profile, err := s.CreateProfile(ProfileInput{Name: &profileName, Kind: &kind})
				if err != nil {
					t.Fatal(err)
				}
				if _, err := s.DeleteProfile(profile.ID); err != nil {
					t.Fatal(err)
				}
			}
			profiles, err := s.ListProfiles()
			if err != nil {
				t.Fatal(err)
			}
			payload, err := json.Marshal(profiles)
			if err != nil {
				t.Fatal(err)
			}
			if string(payload) != "[]" {
				t.Fatalf("empty profiles JSON = %s, want []", payload)
			}
		})
	}
}

func TestProfileRootCACertRoundTrip(t *testing.T) {
	s := openTemp(t)
	name, kind, host, pem := "pg", engines.KindPostgres, "db.local", "test-root-ca-pem"
	profile, err := s.CreateProfile(ProfileInput{Name: &name, Kind: &kind, Host: &host, SSLCACert: &pem})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}
	if profile.SSLCACert == nil || *profile.SSLCACert != pem {
		t.Fatalf("created Root CA = %v, want %q", profile.SSLCACert, pem)
	}

	profiles, err := s.ListProfiles()
	if err != nil || len(profiles) != 1 || profiles[0].SSLCACert == nil || *profiles[0].SSLCACert != pem {
		t.Fatalf("listed Root CA profile = %+v, err = %v", profiles, err)
	}
	connectProfile, err := s.ProfileForConnect(profile.ID)
	if err != nil || connectProfile.SSLCACert != pem {
		t.Fatalf("connect Root CA = %q, err = %v", connectProfile.SSLCACert, err)
	}

	empty := ""
	updated, err := s.UpdateProfile(profile.ID, ProfileInput{SSLCACert: &empty})
	if err != nil {
		t.Fatalf("clear Root CA: %v", err)
	}
	if updated.SSLCACert == nil || *updated.SSLCACert != "" || updated.Host == nil || *updated.Host != host {
		t.Fatalf("updated profile = %+v, want empty Root CA and preserved host", updated)
	}
}

func TestProfileMigrationPreservesRootCACert(t *testing.T) {
	for _, tc := range []struct {
		name       string
		withCACert bool
	}{
		{name: "adds missing column"},
		{name: "preserves value through kind rebuild", withCACert: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := createLegacyProfileDB(t, tc.withCACert)
			s, err := Open(path)
			if err != nil {
				t.Fatalf("open legacy profile database: %v", err)
			}
			defer s.Close()

			profile, err := s.GetProfile("legacy")
			if err != nil || profile == nil {
				t.Fatalf("get migrated profile = %+v, err = %v", profile, err)
			}
			if profile.Name != "Legacy profile" || profile.Host == nil || *profile.Host != "db.local" || profile.Database == nil || *profile.Database != "app" {
				t.Fatalf("unrelated profile data changed during migration: %+v", profile)
			}
			if tc.withCACert && (profile.SSLCACert == nil || *profile.SSLCACert != "saved-root-ca-pem") {
				t.Fatalf("migrated Root CA = %v, want saved PEM", profile.SSLCACert)
			}
			if !tc.withCACert && profile.SSLCACert != nil {
				t.Fatalf("new Root CA column should be empty, got %q", *profile.SSLCACert)
			}
		})
	}
}

// Seed old profile schemas so migration tests cover both a missing CA column and a value copied by kind rebuilds.
func createLegacyProfileDB(t *testing.T, withCACert bool) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "kamehadb.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	caColumn := ""
	insertSQL := `INSERT INTO connection_profiles (id, name, kind, host, database, ssl)
		VALUES ('legacy', 'Legacy profile', 'postgres', 'db.local', 'app', 1)`
	if withCACert {
		caColumn = "ssl_ca_cert TEXT,"
		insertSQL = `INSERT INTO connection_profiles (id, name, kind, host, database, ssl, ssl_ca_cert)
			VALUES ('legacy', 'Legacy profile', 'postgres', 'db.local', 'app', 1, 'saved-root-ca-pem')`
	}
	ddl := fmt.Sprintf(`CREATE TABLE connection_profiles (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		kind TEXT NOT NULL CHECK(kind IN ('postgres','sqlite','mysql','redis','mongodb','qdrant','sqlserver','oracle','clickhouse')),
		host TEXT, port INTEGER, database TEXT, username TEXT,
		password TEXT, ssl INTEGER DEFAULT 0, file_path TEXT, color TEXT,
		connection_string TEXT, %s
		created_at TEXT NOT NULL DEFAULT (datetime('now')),
		updated_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`, caColumn)
	if _, err := db.Exec(ddl); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(insertSQL); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	return path
}

// A vault key that cannot be read (locked keychain, keyring reset, no keyring)
// must not hide the connection list: listing drops the field it cannot decrypt
// so the user still sees their connections, while the connect path stays strict
// and reports the failure. (Why)
func TestListProfilesSurvivesUnreadableVaultKey(t *testing.T) {
	withMemoryKeyring(t)
	path := filepath.Join(t.TempDir(), "kamehadb.db")
	seedLegacyPlaintext(t, path)

	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if pw, err := s.GetProfilePassword("p1"); err != nil || pw != "pw-plain" {
		t.Fatalf("password before key loss = %q, %v", pw, err)
	}

	// The keychain is gone: reads fail and no key file exists to fall back on.
	keyringGet = func(string, string) (string, error) { return "", errors.New("keychain locked") }

	profiles, err := s.ListProfiles()
	if err != nil {
		t.Fatalf("list must survive an unreadable vault key: %v", err)
	}
	if len(profiles) != 1 || profiles[0].Name != "Legacy" {
		t.Fatalf("profiles = %+v", profiles)
	}
	if profiles[0].ConnectionString != nil {
		t.Errorf("unreadable connection string should be dropped, got %q", *profiles[0].ConnectionString)
	}
	if _, err := s.GetProfile("p1"); err == nil {
		t.Error("GetProfile must still report the unreadable secret")
	}
}

// Updating a profile whose secret cannot be decrypted must succeed so users
// can repair broken credentials or edit unrelated fields without wiping out
// the stored ciphertext. (Why)
func TestUpdateProfileSurvivesUnreadableVaultKey(t *testing.T) {
	withMemoryKeyring(t)
	path := filepath.Join(t.TempDir(), "kamehadb.db")
	seedLegacyPlaintext(t, path)

	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	// Invalidate the vault key: secret reads fail.
	originalGet := keyringGet
	keyringGet = func(string, string) (string, error) { return "", errors.New("keychain locked") }

	// 1. Updating name only must succeed and keep the stored raw secret intact.
	newName := "Renamed Legacy"
	updated, err := s.UpdateProfile("p1", ProfileInput{Name: &newName})
	if err != nil {
		t.Fatalf("update profile name must succeed even with locked keychain: %v", err)
	}
	if updated.Name != newName {
		t.Errorf("updated name = %q, want %q", updated.Name, newName)
	}

	// 2. Restoring the keychain confirms the stored connection string was not erased.
	keyringGet = originalGet
	restored, err := s.GetProfile("p1")
	if err != nil {
		t.Fatalf("GetProfile should succeed after keychain recovery: %v", err)
	}
	if restored.ConnectionString == nil || *restored.ConnectionString != "postgres://u:p@h/db" {
		t.Errorf("connection string should be preserved verbatim, got %v", restored.ConnectionString)
	}

	// 3. Updating with a new connection string encrypts and saves successfully.
	newConn := "postgres://new-uri"
	if _, err := s.UpdateProfile("p1", ProfileInput{ConnectionString: &newConn}); err != nil {
		t.Fatalf("updating connection string failed: %v", err)
	}
	updatedConn, err := s.GetProfile("p1")
	if err != nil || updatedConn.ConnectionString == nil || *updatedConn.ConnectionString != newConn {
		t.Fatalf("updated connection string = %v, err %v", updatedConn.ConnectionString, err)
	}
}
