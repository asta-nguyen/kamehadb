import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTauriRuntime: vi.fn<() => boolean>(),
  invokeTauri: vi.fn(),
  api: {
    getMcpCredentialRefs: vi.fn(),
    hydrateMcpCredential: vi.fn(),
    prepareMcpAccount: vi.fn(),
    provisionMcpAccount: vi.fn(),
    getMcpAccounts: vi.fn(),
    revokeMcpAccount: vi.fn(),
    completeMcpAccountRevocation: vi.fn(),
  },
}));

vi.mock('./tauri', () => ({ invokeTauri: mocks.invokeTauri, isTauriRuntime: mocks.isTauriRuntime }));
vi.mock('./api', () => ({ api: mocks.api }));

import { createMcpManagedAccount, hydrateMcpCredentials, revokeMcpManagedAccount } from './mcp-keychain';

afterEach(() => {
  vi.clearAllMocks();
});

describe('MCP Keychain bridge', () => {
  it('rehydrates each managed credential into sidecar memory without exposing it in query data', async () => {
    const credential = { kind: 'postgres', username: 'kdbmcp_x', password: 'secret' } as const;
    mocks.isTauriRuntime.mockReturnValue(true);
    mocks.api.getMcpCredentialRefs.mockResolvedValue({
      credentials: [{ profileId: 'profile', keychainRef: 'opaque-ref', state: 'ready' }],
    });
    mocks.invokeTauri.mockResolvedValue(JSON.stringify(credential));

    await hydrateMcpCredentials();

    expect(mocks.invokeTauri).toHaveBeenCalledWith('get_credential', {
      service: 'com.kamehadb.mcp-managed-account',
      account: 'opaque-ref',
    });
    expect(mocks.api.hydrateMcpCredential).toHaveBeenCalledWith('profile', credential);
  });

  it('stores and hydrates generated credentials before asking the sidecar to provision them', async () => {
    const credential = { kind: 'postgres', username: 'kdbmcp_x', password: 'secret' } as const;
    mocks.isTauriRuntime.mockReturnValue(true);
    mocks.api.prepareMcpAccount.mockResolvedValue({ credential });
    mocks.api.provisionMcpAccount.mockResolvedValue({ state: 'ready' });
    mocks.invokeTauri.mockResolvedValue(undefined);

    await createMcpManagedAccount('profile');

    expect(mocks.invokeTauri).toHaveBeenCalledWith(
      'store_credential',
      expect.objectContaining({
        service: 'com.kamehadb.mcp-managed-account',
        password: JSON.stringify(credential),
      }),
    );
    expect(mocks.api.hydrateMcpCredential).toHaveBeenCalledWith('profile', credential);
    expect(mocks.api.provisionMcpAccount).toHaveBeenCalledWith('profile', expect.any(String));
  });

  it('keeps the Keychain secret if provisioning needs explicit recovery', async () => {
    const credential = { kind: 'postgres', username: 'kdbmcp_x', password: 'secret' } as const;
    mocks.isTauriRuntime.mockReturnValue(true);
    mocks.api.prepareMcpAccount.mockResolvedValue({ credential });
    mocks.api.provisionMcpAccount.mockRejectedValue(new Error('Setup interrupted'));
    mocks.api.getMcpAccounts.mockResolvedValue({
      accounts: [{ profileId: 'profile', applicable: true, state: 'recovery_required', credentialAvailable: true }],
    });
    mocks.invokeTauri.mockResolvedValue(undefined);

    await expect(createMcpManagedAccount('profile')).rejects.toThrow('Setup interrupted');

    expect(mocks.api.revokeMcpAccount).not.toHaveBeenCalled();
    expect(mocks.invokeTauri).not.toHaveBeenCalledWith('delete_credential', expect.anything());
  });

  it('revokes the database account before deleting the Keychain item', async () => {
    mocks.isTauriRuntime.mockReturnValue(true);
    mocks.api.getMcpCredentialRefs.mockResolvedValue({
      credentials: [{ profileId: 'profile', keychainRef: 'opaque-ref', state: 'ready' }],
    });
    mocks.api.revokeMcpAccount.mockResolvedValue({ revoked: true });
    mocks.invokeTauri.mockResolvedValue(undefined);

    await expect(revokeMcpManagedAccount('profile')).resolves.toEqual({ keychainCleanedUp: true });
    expect(mocks.api.revokeMcpAccount).toHaveBeenCalledBefore(mocks.invokeTauri);
    expect(mocks.api.completeMcpAccountRevocation).toHaveBeenCalledAfter(mocks.invokeTauri);
    expect(mocks.invokeTauri).toHaveBeenCalledWith('delete_credential', {
      service: 'com.kamehadb.mcp-managed-account',
      account: 'opaque-ref',
    });
  });
});
