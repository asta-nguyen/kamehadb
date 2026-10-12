import { api } from './api';

// The backend stores the generated credential before it provisions the database account.
// A prepared account has made no database change, so a failed setup can discard it safely.
export async function createMcpManagedAccount(profileId: string): Promise<void> {
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
  await api.revokeMcpAccount(profileId);
}
