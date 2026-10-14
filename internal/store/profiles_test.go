package store

import (
	"encoding/json"
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
