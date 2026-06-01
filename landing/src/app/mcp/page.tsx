import type { Metadata } from 'next';
import McpView from '../../components/mcp-view';

export const metadata: Metadata = {
  title: 'MCP Server',
  description:
    'KamehaDB MCP Server — 8 read-only tools for AI coding assistants (Claude Code, Codex CLI, OpenCode). Drop a config snippet, start the sidecar, and your AI can read schemas, run SELECTs, and explore Mongo / Redis.',
  alternates: {
    canonical: '/mcp',
  },
};

export default function McpPage() {
  return <McpView />;
}
