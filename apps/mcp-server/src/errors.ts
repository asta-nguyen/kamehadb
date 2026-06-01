import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SidecarError } from './client.js';

export function mapSidecarError(err: unknown): CallToolResult {
  if (err instanceof SidecarError) {
    if (err.code === 'CONNECTION_ERROR') {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'KamehaDB sidecar not running at the configured URL. Start it with: pnpm dev:sidecar',
          },
        ],
      };
    }
    if (err.status === 403 && err.code === 'FORBIDDEN') {
      return {
        isError: true,
        content: [{ type: 'text', text: `Read-only rejected query: ${err.sidecarMessage}` }],
      };
    }
    if (err.status === 404 && err.code === 'NOT_FOUND') {
      return {
        isError: true,
        content: [{ type: 'text', text: err.sidecarMessage || 'Resource not found' }],
      };
    }
    if (err.status >= 500) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Sidecar error (${err.status}): ${err.sidecarMessage}` }],
      };
    }
    return {
      isError: true,
      content: [{ type: 'text', text: `Sidecar ${err.code}: ${err.sidecarMessage}` }],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: 'text', text: `MCP server error: ${message}` }],
  };
}
