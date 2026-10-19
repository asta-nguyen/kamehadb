export const SCHEMA_CACHE_TIME = 5 * 60 * 1000;
export const STATS_CACHE_TIME = 30 * 1000;

/**
 * Fixed local ACP agent presets the user can select as the chat backend.
 * KamehaDB never accepts an arbitrary command, so this list is closed.
 * Mirrors `internal/acp/catalog.go`.
 */
export const ACP_AGENTS = ['codex', 'claude', 'opencode', 'devin'] as const;

export type AcpAgentId = (typeof ACP_AGENTS)[number];

// Display labels for the ACP presets, keyed for exhaustive mapping. Mirrors the
// Label field in `internal/acp/catalog.go`.
export const ACP_AGENT_LABELS: Record<AcpAgentId, string> = {
  codex: 'Codex',
  claude: 'Claude',
  opencode: 'OpenCode',
  devin: 'Devin',
};
