import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { randomUUID } from 'node:crypto';
import { isMcpServerKind, KIND, MCP_MANAGED_ACCOUNT_STATE, UpdateMcpPortSchema } from '@kamehadb/shared';
import * as metadataStore from '../db/metadata-store.js';
import { log } from '../lib/logger.js';
import type { McpRuntime } from '../mcp/runtime.js';
import {
  isMcpManagedCredentialForProfile,
  McpAccountOperationError,
  prepareMcpAccount,
  provisionMcpAccount,
  revokeMcpAccount,
} from '../mcp/account-provisioner.js';

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

  router.post('/profiles/:profileId/account/prepare', (c) => {
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

    const accountRef = randomUUID();
    let accountCreated = false;
    try {
      const credential = prepareMcpAccount(profile, accountRef);
      metadataStore.createMcpManagedAccount(profileId, accountRef);
      accountCreated = true;
      metadataStore.saveMcpManagedCredential(profileId, credential);
      const stored = metadataStore.loadMcpManagedCredential(profileId);
      if (!stored || !isMcpManagedCredentialForProfile(profile, accountRef, stored)) {
        throw new McpAccountOperationError('Stored MCP credential could not be verified');
      }
      runtime.adapterManager.setCredential(profileId, stored);
      return c.json({ profileId, state: MCP_MANAGED_ACCOUNT_STATE.PREPARED }, 201);
    } catch (error) {
      if (accountCreated) metadataStore.clearMcpManagedAccount(profileId);
      const message =
        error instanceof McpAccountOperationError ? error.message : 'MCP credential could not be stored locally';
      return c.json({ error: 'PREPARE_FAILED', message }, 400);
    }
  });

  router.post('/profiles/:profileId/account/provision', async (c) => {
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
    if (account.state !== MCP_MANAGED_ACCOUNT_STATE.PREPARED) {
      return c.json({ error: 'MANAGED_ACCOUNT_NOT_READY', message: 'MCP account is not ready to provision' }, 409);
    }
    const credential = runtime.adapterManager.getCredential(profileId);
    if (!credential) {
      return c.json(
        {
          error: 'MANAGED_CREDENTIAL_UNAVAILABLE',
          message: 'The prepared credential is unavailable; revoke and create the account again',
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
        account.accountRef,
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
      if (
        account.state !== MCP_MANAGED_ACCOUNT_STATE.PREPARED &&
        account.state !== MCP_MANAGED_ACCOUNT_STATE.LOCAL_CLEANUP_PENDING
      ) {
        try {
          await revokeMcpAccount(profile, metadataStore.getProfilePassword(profileId), account.accountRef);
        } catch (error) {
          log.warn(
            {
              profileId,
              kind: profile.kind,
              databaseCode: error instanceof McpAccountOperationError ? error.databaseCode : undefined,
            },
            'Managed MCP account revoke failed',
          );
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

      // The pending state lets a retry finish local cleanup without dropping the DB account twice.
      metadataStore.setMcpManagedAccountState(profileId, MCP_MANAGED_ACCOUNT_STATE.LOCAL_CLEANUP_PENDING);
      metadataStore.clearMcpManagedAccount(profileId);
      return c.json({ profileId, revoked: true });
    } finally {
      revokingProfiles.delete(profileId);
    }
  });

  return router;
}
