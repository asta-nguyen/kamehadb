import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTauriRuntime: vi.fn<() => boolean>(),
  api: {
    prepareMcpAccount: vi.fn(),
    provisionMcpAccount: vi.fn(),
    getMcpAccounts: vi.fn(),
    revokeMcpAccount: vi.fn(),
  },
}));

vi.mock('./tauri', () => ({ isTauriRuntime: mocks.isTauriRuntime }));
vi.mock('./api', () => ({ api: mocks.api }));

import { createMcpManagedAccount, revokeMcpManagedAccount } from './mcp-managed-account';

afterEach(() => {
  vi.clearAllMocks();
});

describe('MCP managed account actions', () => {
  it('prepares the stored credential before provisioning the database account', async () => {
    mocks.isTauriRuntime.mockReturnValue(true);
    mocks.api.prepareMcpAccount.mockResolvedValue({ state: 'prepared' });
    mocks.api.provisionMcpAccount.mockResolvedValue({ state: 'ready' });

    await createMcpManagedAccount('profile');

    expect(mocks.api.prepareMcpAccount).toHaveBeenCalledWith('profile');
    expect(mocks.api.provisionMcpAccount).toHaveBeenCalledWith('profile');
    expect(mocks.api.prepareMcpAccount).toHaveBeenCalledBefore(mocks.api.provisionMcpAccount);
  });

  it('discards a prepared account after a failed provision request', async () => {
    mocks.isTauriRuntime.mockReturnValue(true);
    mocks.api.prepareMcpAccount.mockResolvedValue({ state: 'prepared' });
    mocks.api.provisionMcpAccount.mockRejectedValue(new Error('Setup failed'));
    mocks.api.getMcpAccounts.mockResolvedValue({
      accounts: [{ profileId: 'profile', state: 'prepared' }],
    });

    await expect(createMcpManagedAccount('profile')).rejects.toThrow('Setup failed');
    expect(mocks.api.revokeMcpAccount).toHaveBeenCalledWith('profile');
  });

  it('leaves an interrupted database operation for explicit recovery', async () => {
    mocks.isTauriRuntime.mockReturnValue(true);
    mocks.api.prepareMcpAccount.mockResolvedValue({ state: 'prepared' });
    mocks.api.provisionMcpAccount.mockRejectedValue(new Error('Setup interrupted'));
    mocks.api.getMcpAccounts.mockResolvedValue({
      accounts: [{ profileId: 'profile', state: 'recovery_required' }],
    });

    await expect(createMcpManagedAccount('profile')).rejects.toThrow('Setup interrupted');
    expect(mocks.api.revokeMcpAccount).not.toHaveBeenCalled();
  });

  it('asks the sidecar to revoke the managed database account', async () => {
    mocks.isTauriRuntime.mockReturnValue(true);
    mocks.api.revokeMcpAccount.mockResolvedValue({ revoked: true });

    await revokeMcpManagedAccount('profile');

    expect(mocks.api.revokeMcpAccount).toHaveBeenCalledWith('profile');
  });
});
