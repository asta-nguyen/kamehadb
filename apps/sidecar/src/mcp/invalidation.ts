import type { McpAdapterManager } from './adapter-manager.js';

// Bridges the connections routes to the MCP adapter cache without importing the
// runtime (which would create a cycle). index.ts sets the manager at startup.
let manager: McpAdapterManager | null = null;

export function setMcpAdapterManager(next: McpAdapterManager): void {
  manager = next;
}

export function invalidateMcpConnection(connectionId: string): void {
  manager?.invalidate(connectionId);
}
