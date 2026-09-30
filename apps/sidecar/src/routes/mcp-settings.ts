import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  isMcpServerKind,
  KIND,
  MCP_MANAGED_ACCOUNT_STATE,
  McpAccountProvisionSchema,
  McpCredentialHydrationSchema,
  McpPrepareAccountSchema,
  UpdateMcpPortSchema,
} from '@kamehadb/shared';
import * as metadataStore from '../db/metadata-store.js';
import type { McpRuntime } from '../mcp/runtime.js';
import {
  isMcpManagedCredentialForProfile,
  McpAccountOperationError,
  prepareMcpAccount,
  provisionMcpAccount,
  revokeMcpAccount,
} from '../mcp/account-provisioner.js';
import { MCP_ERROR_CODE } from '../mcp/errors.js';

// These management routes run on the authenticated internal sidecar listener, not MCP transport.
export function createMcpSettingsRouter(runtime: McpRuntime): Hono {
  const router = new Hono();
  const provisioningProfiles = new Set<string>();
  const revokingProfiles = new Set<string>();

  router.get('/settings', (c) => c.json(runtime.settingsResponse()));

  router.patch('/settings', zValidator('json', UpdateMcpPortSchema), async (c) => {
    const { port } = c.req.valid('json');
    await runtime.updatePort(port);
    return c.json(runtime.settingsResponse());
  });

  router.post('/settings/retry', async (c) => {
    await runtime.retry();
    return c.json(runtime.settingsResponse());
  });

  router.post('/settings/rotate-token', (c) => {
    runtime.rotateToken();
    return c.json(runtime.settingsResponse());
  });

  router.get('/accounts', (c) => {
    const records = new Map(metadataStore.listMcpManagedAccounts().map((record) => [record.profileId, record]));
    return c.json({
      accounts: metadataStore.listProfiles().map((profile) => ({
        profileId: profile.id,
        applicable: isMcpServerKind(profile.kind) || profile.kind === KIND.SQLITE,
        state: records.get(profile.id)?.state ?? null,
        credentialAvailable: runtime.adapterManager.hasCredential(profile.id),
      })),
    });
  });

  router.get('/credential-refs', (c) => {
    return c.json({
      credentials: metadataStore.listMcpManagedAccounts().map(({ profileId, keychainRef, state }) => ({
        profileId,
        keychainRef,
        state,
      })),
    });
  });

  router.put('/credentials/:profileId', zValidator('json', McpCredentialHydrationSchema), (c) => {
    const profileId = c.req.param('profileId');
    if (revokingProfiles.has(profileId)) {
      return c.json(
        { error: 'ACCOUNT_OPERATION_IN_PROGRESS', message: 'Another MCP account operation is in progress' },
        409,
      );
    }
    const profile = metadataStore.getProfile(profileId);
    const account = metadataStore.getMcpManagedAccount(profileId);
    if (!profile || !account || !isMcpServerKind(profile.kind)) {
      return c.json(
        { error: MCP_ERROR_CODE.MANAGED_ACCOUNT_NOT_READY, message: 'Managed account is not configured' },
        404,
      );
    }
    const { credential } = c.req.valid('json');
    if (credential.kind !== profile.kind) {
      return c.json(
        { error: 'CREDENTIAL_KIND_MISMATCH', message: 'Keychain credential does not match this profile' },
        400,
      );
    }
    if (!isMcpManagedCredentialForProfile(profile, account.keychainRef, credential)) {
      return c.json(
        { error: 'CREDENTIAL_IDENTITY_MISMATCH', message: 'Keychain credential does not match this managed account' },
        400,
      );
    }
    runtime.adapterManager.setCredential(profileId, credential);
    return c.json({ profileId, credentialAvailable: true });
  });

  router.post('/profiles/:profileId/account/prepare', zValidator('json', McpPrepareAccountSchema), (c) => {
    const profileId = c.req.param('profileId');
    const profile = metadataStore.getProfile(profileId);
    if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found' }, 404);
    if (!isMcpServerKind(profile.kind)) {
      return c.json({ error: 'UNSUPPORTED_KIND', message: 'This database does not use a managed MCP account' }, 400);
    }
    if (metadataStore.getMcpManagedAccount(profileId)) {
      return c.json(
        { error: 'MANAGED_ACCOUNT_EXISTS', message: 'Revoke the existing MCP account before setting it up again' },
        409,
      );
    }

    const { keychainRef } = c.req.valid('json');
    try {
      metadataStore.createMcpManagedAccount(profileId, keychainRef);
      return c.json({ credential: prepareMcpAccount(profile, keychainRef) }, 201);
    } catch (error) {
      metadataStore.clearMcpManagedAccount(profileId);
      const message =
        error instanceof McpAccountOperationError ? error.message : 'MCP account setup could not be prepared';
      return c.json({ error: 'PREPARE_FAILED', message }, 400);
    }
  });

  router.post('/profiles/:profileId/account/provision', zValidator('json', McpAccountProvisionSchema), async (c) => {
    const profileId = c.req.param('profileId');
    if (provisioningProfiles.has(profileId) || revokingProfiles.has(profileId)) {
      return c.json(
        { error: 'ACCOUNT_OPERATION_IN_PROGRESS', message: 'Another MCP account operation is in progress' },
        409,
      );
    }
    const profile = metadataStore.getProfile(profileId);
    const account = metadataStore.getMcpManagedAccount(profileId);
    if (!profile || !account)
      return c.json({ error: 'MANAGED_ACCOUNT_NOT_READY', message: 'MCP account setup is incomplete' }, 404);
    if (
      account.keychainRef !== c.req.valid('json').keychainRef ||
      account.state !== MCP_MANAGED_ACCOUNT_STATE.PREPARED
    ) {
      return c.json({ error: 'MANAGED_ACCOUNT_NOT_READY', message: 'MCP account is not ready to provision' }, 409);
    }
    const credential = runtime.adapterManager.getCredential(profileId);
    if (!credential) {
      return c.json(
        {
          error: 'MANAGED_CREDENTIAL_UNAVAILABLE',
          message: 'Store the generated credential in the operating system keychain and retry',
        },
        409,
      );
    }

    provisioningProfiles.add(profileId);
    let databaseWriteStarted = false;
    try {
      await provisionMcpAccount(
        profile,
        metadataStore.getProfilePassword(profileId),
        account.keychainRef,
        credential,
        () => {
          if (!metadataStore.setMcpManagedAccountState(profileId, MCP_MANAGED_ACCOUNT_STATE.PROVISIONING)) {
            throw new McpAccountOperationError('MCP account state could not be updated before database changes');
          }
          databaseWriteStarted = true;
        },
      );
      metadataStore.setMcpManagedAccountState(profileId, MCP_MANAGED_ACCOUNT_STATE.READY);
      return c.json({ profileId, state: MCP_MANAGED_ACCOUNT_STATE.READY });
    } catch (error) {
      const cleanupFailed = error instanceof McpAccountOperationError && error.cleanupFailed;
      await runtime.adapterManager.clearCredential(profileId);
      metadataStore.setMcpManagedAccountState(
        profileId,
        cleanupFailed ? MCP_MANAGED_ACCOUNT_STATE.RECOVERY_REQUIRED : MCP_MANAGED_ACCOUNT_STATE.PREPARED,
      );
      const message =
        error instanceof McpAccountOperationError ? error.message : 'MCP account could not be provisioned';
      return c.json(
        {
          error: cleanupFailed ? 'RECOVERY_REQUIRED' : 'PROVISIONING_FAILED',
          message,
          databaseWriteStarted,
        },
        cleanupFailed ? 500 : 400,
      );
    } finally {
      provisioningProfiles.delete(profileId);
    }
  });

  router.post('/profiles/:profileId/account/revoke', async (c) => {
    const profileId = c.req.param('profileId');
    if (provisioningProfiles.has(profileId) || revokingProfiles.has(profileId)) {
      return c.json(
        { error: 'ACCOUNT_OPERATION_IN_PROGRESS', message: 'Another MCP account operation is in progress' },
        409,
      );
    }
    const profile = metadataStore.getProfile(profileId);
    const account = metadataStore.getMcpManagedAccount(profileId);
    if (!profile || !account) return c.json({ error: 'NOT_FOUND', message: 'Managed MCP account not found' }, 404);

    revokingProfiles.add(profileId);
    try {
      metadataStore.setProfileMcpEnabled(profileId, false);
      await runtime.adapterManager.clearCredential(profileId);
      if (account.state !== MCP_MANAGED_ACCOUNT_STATE.PREPARED) {
        try {
          await revokeMcpAccount(profile, metadataStore.getProfilePassword(profileId), account.keychainRef);
        } catch {
          metadataStore.setMcpManagedAccountState(profileId, MCP_MANAGED_ACCOUNT_STATE.REVOKE_FAILED);
          return c.json(
            {
              error: 'REVOKE_FAILED',
              message: 'Database account could not be revoked. Retry without changing the profile.',
            },
            409,
          );
        }
      }

      metadataStore.clearMcpManagedAccount(profileId);
      return c.json({ profileId, revoked: true });
    } finally {
      revokingProfiles.delete(profileId);
    }
  });

  return router;
}
