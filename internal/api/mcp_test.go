package api

import "testing"

func TestMCPServiceReturnsUnavailableWhenRuntimeIsMissing(t *testing.T) {
	service := &McpService{}
	checks := []struct {
		name string
		call func() error
	}{
		{"GetMCPSettings", func() error { _, err := service.GetMCPSettings(); return err }},
		{"UpdateMCPPort", func() error { _, err := service.UpdateMCPPort(14000); return err }},
		{"RetryMCPListener", func() error { _, err := service.RetryMCPListener(); return err }},
		{"RotateMCPToken", func() error { _, err := service.RotateMCPToken(); return err }},
		{"SetMCPHistoryEnabled", func() error { _, err := service.SetMCPHistoryEnabled(false); return err }},
		{"GetMCPAccounts", func() error { _, err := service.GetMCPAccounts(); return err }},
		{"PrepareMCPAccount", func() error { _, err := service.PrepareMCPAccount("profile"); return err }},
		{"ProvisionMCPAccount", func() error { _, err := service.ProvisionMCPAccount("profile"); return err }},
		{"RevokeMCPAccount", func() error { _, err := service.RevokeMCPAccount("profile"); return err }},
	}

	for _, check := range checks {
		t.Run(check.name, func(t *testing.T) {
			if err := check.call(); err == nil || err.Error() != "MCP runtime is unavailable" {
				t.Fatalf("want MCP runtime unavailable error, got %v", err)
			}
		})
	}
}
