import { api } from './api';
import { isTauriRuntime } from './tauri';

// The sidecar stores the generated credential before it provisions the database account.
// A prepared account has made no database change, so a failed setup can discard it safely.
export async function createMcpManagedAccount(profileId: string): Promise<void> {
  if (!isTauriRuntime()) throw new Error('Managed MCP accounts require the KamehaDB desktop app');
  let prepared = false;
  try {
    await api.prepareMcpAccount(profileId);
    prepared = true;
    await api.provisionMcpAccount(profileId);
  } catch (error) {
    if (prepared) {
      try {
        const { accounts } = await api.getMcpAccounts();
        const state = accounts.find((account) => account.profileId === profileId)?.state;
        if (state === 'prepared') await api.revokeMcpAccount(profileId);
      } catch {
        // Preserve an interrupted database operation for explicit recovery.
      }
    }
    throw error;
  }
}

export async function revokeMcpManagedAccount(profileId: string): Promise<void> {
  if (!isTauriRuntime()) throw new Error('Managed MCP accounts require the KamehaDB desktop app');
  await api.revokeMcpAccount(profileId);
}
