import type { McpManagedCredentialBundle } from '@kamehadb/shared';
import { api } from './api';
import { invokeTauri, isTauriRuntime } from './tauri';

const MCP_KEYCHAIN_SERVICE = 'com.kamehadb.mcp-managed-account';

async function deleteKeychainCredential(keychainRef: string): Promise<boolean> {
  try {
    await invokeTauri<void>('delete_credential', { service: MCP_KEYCHAIN_SERVICE, account: keychainRef });
    return true;
  } catch {
    return false;
  }
}

// Hydrate the sidecar's process memory from Keychain after every child startup.
export async function hydrateMcpCredentials(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { credentials } = await api.getMcpCredentialRefs();
  await Promise.all(
    credentials.map(async ({ profileId, keychainRef }) => {
      try {
        const stored = await invokeTauri<string>('get_credential', {
          service: MCP_KEYCHAIN_SERVICE,
          account: keychainRef,
        });
        const credential = JSON.parse(stored) as McpManagedCredentialBundle;
        await api.hydrateMcpCredential(profileId, credential);
      } catch {
        // Leave this profile unavailable; MCP never falls back to saved profile credentials.
      }
    }),
  );
}

// Keep generated secrets in this short-lived operation instead of React state or query caches.
export async function createMcpManagedAccount(profileId: string): Promise<void> {
  if (!isTauriRuntime()) throw new Error('Managed MCP accounts require the KamehaDB desktop app');
  const keychainRef = crypto.randomUUID();
  let prepared = false;
  try {
    const result = await api.prepareMcpAccount(profileId, keychainRef);
    prepared = true;
    await invokeTauri<void>('store_credential', {
      service: MCP_KEYCHAIN_SERVICE,
      account: keychainRef,
      password: JSON.stringify(result.credential),
    });
    await api.hydrateMcpCredential(profileId, result.credential);
    await api.provisionMcpAccount(profileId, keychainRef);
  } catch (error) {
    if (prepared) {
      try {
        const { accounts } = await api.getMcpAccounts();
        const state = accounts.find((account) => account.profileId === profileId)?.state;
        if (state === 'prepared') {
          await api.revokeMcpAccount(profileId);
          await deleteKeychainCredential(keychainRef);
        }
      } catch {
        // Preserve the Keychain item when sidecar state cannot prove setup never completed.
      }
    }
    throw error;
  }
}

export async function revokeMcpManagedAccount(profileId: string): Promise<{ keychainCleanedUp: boolean }> {
  if (!isTauriRuntime()) throw new Error('Managed MCP accounts require the KamehaDB desktop app');
  const { credentials } = await api.getMcpCredentialRefs();
  const reference = credentials.find((credential) => credential.profileId === profileId);
  await api.revokeMcpAccount(profileId);
  const keychainCleanedUp = reference ? await deleteKeychainCredential(reference.keychainRef) : true;
  return { keychainCleanedUp };
}
