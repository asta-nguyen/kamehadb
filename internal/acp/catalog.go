// Package acp runs fixed local Agent Client Protocol (ACP) v1 agents as
// KamehaDB chat backends. The agent set is fixed: KamehaDB never accepts an
// arbitrary command, installs agents, or builds a dynamic registry.
package acp

// AgentID identifies one of the fixed local ACP presets.
type AgentID string

const (
	AgentCodex    AgentID = "codex"
	AgentClaude   AgentID = "claude"
	AgentOpenCode AgentID = "opencode"
	AgentDevin    AgentID = "devin"
)

// Preset is a fixed launch definition. Executable and Args are never derived
// from user input; only the four entries below are valid.
type Preset struct {
	ID         AgentID
	Label      string
	Executable string
	Args       []string
}

// presets is the canonical launch catalog. The npm adapter versions are
// pinned so a turn is reproducible; bumping a pin is a deliberate code change.
var presets = []Preset{
	{ID: AgentCodex, Label: "Codex", Executable: "npx", Args: []string{"-y", "@agentclientprotocol/codex-acp@2.2.2"}},
	{ID: AgentClaude, Label: "Claude", Executable: "npx", Args: []string{"-y", "@agentclientprotocol/claude-agent-acp@0.93.0"}},
	{ID: AgentOpenCode, Label: "OpenCode", Executable: "opencode", Args: []string{"acp"}},
	{ID: AgentDevin, Label: "Devin", Executable: "devin", Args: []string{"acp"}},
}

// Presets returns the fixed catalog. Callers must not mutate the result.
func Presets() []Preset { return presets }

// IsValidID reports whether id is one of the fixed presets.
func IsValidID(id string) bool {
	for _, p := range presets {
		if string(p.ID) == id {
			return true
		}
	}
	return false
}

// Lookup returns the preset for id and whether it exists.
func Lookup(id string) (Preset, bool) {
	for _, p := range presets {
		if string(p.ID) == id {
			return p, true
		}
	}
	return Preset{}, false
}
