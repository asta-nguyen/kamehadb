import { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw, RotateCw } from 'lucide-react';
import { cn } from 'cnfast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { isMcpSupportedKind, KIND, MCP_MANAGED_ACCOUNT_STATE, type McpManagedAccountStatus } from '@kamehadb/shared';
import { toastError, toastSuccess } from '@/lib/toast';
import { useConnections } from '@/hooks/use-connections';
import {
  useMcpSettings,
  useMcpCallHistory,
  useSetMcpHistoryEnabled,
  useClearMcpCallHistory,
  useRetryMcpListener,
  useRotateMcpToken,
  useSetConnectionMcpEnabled,
  useUpdateMcpPort,
  useMcpAccounts,
  useCreateMcpManagedAccount,
  useRevokeMcpManagedAccount,
} from '@/hooks/use-mcp-settings';

type Snippet = { label: string; content: string };
type McpView = 'settings' | 'logs';

// Build the four client configurations with the live endpoint and token so no
// placeholder ever reaches a client config file.
function buildSnippets(endpoint: string, token: string): Snippet[] {
  return [
    {
      label: 'Codex',
      content: `[mcp_servers.kamehadb]\nurl = "${endpoint}"\nhttp_headers = { Authorization = "Bearer ${token}" }`,
    },
    {
      label: 'Claude Code',
      content: `claude mcp add --transport http kamehadb "${endpoint}" --header "Authorization: Bearer ${token}"`,
    },
    {
      label: 'Devin CLI',
      content: JSON.stringify(
        {
          mcpServers: {
            kamehadb: { url: endpoint, transport: 'http', headers: { Authorization: `Bearer ${token}` } },
          },
        },
        null,
        2,
      ),
    },
    {
      label: 'OpenCode',
      content: JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          mcp: {
            servers: {
              kamehadb: {
                type: 'remote',
                url: endpoint,
                oauth: false,
                headers: { Authorization: `Bearer ${token}` },
              },
            },
          },
        },
        null,
        2,
      ),
    },
  ];
}

// Text-style view switch matching the Logs page filters; the active view keeps the muted highlight. (Why / What)
function filterClass(active: boolean): string {
  return cn(
    'px-1.5 text-xs font-medium uppercase hover:bg-transparent',
    active ? 'bg-muted font-semibold text-foreground hover:bg-muted' : 'text-muted-foreground hover:text-foreground',
  );
}

// Icon-only copy action; the label drives the tooltip and the toast text. (What)
function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className="shrink-0"
      title={`Copy ${label.toLowerCase()}`}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => toastSuccess(`${label} copied`))
          .catch(() => toastError(`Failed to copy ${label}`));
      }}
    >
      <Copy className="size-3.5" />
    </Button>
  );
}

export function McpSettingsSection() {
  const settingsQuery = useMcpSettings();
  const historyQuery = useMcpCallHistory();
  const connectionsQuery = useConnections();
  const accountsQuery = useMcpAccounts();
  const updatePort = useUpdateMcpPort();
  const retryListener = useRetryMcpListener();
  const rotateToken = useRotateMcpToken();
  const toggleProfile = useSetConnectionMcpEnabled();
  const createAccount = useCreateMcpManagedAccount();
  const revokeAccount = useRevokeMcpManagedAccount();
  const setHistoryEnabled = useSetMcpHistoryEnabled();
  const clearHistory = useClearMcpCallHistory();

  const settings = settingsQuery.data;
  const [portDraft, setPortDraft] = useState('');
  const [view, setView] = useState<McpView>('settings');
  const [clientLabel, setClientLabel] = useState('');

  // Keep the editable port in sync with the persisted value without clobbering
  // in-progress typing after an unrelated refetch.
  useEffect(() => {
    if (settings) setPortDraft(String(settings.port));
  }, [settings?.port]);

  const snippets = useMemo(
    () => (settings ? buildSnippets(settings.endpoint, settings.token) : []),
    [settings?.endpoint, settings?.token],
  );

  // Selected client snippet; falls back to the first client until one is chosen. (What / Why)
  const activeSnippet = snippets.find((snippet) => snippet.label === clientLabel) ?? snippets[0];

  const eligibleProfiles = (connectionsQuery.data ?? []).filter((profile) => isMcpSupportedKind(profile.kind));
  const profileNames = new Map((connectionsQuery.data ?? []).map((profile) => [profile.id, profile.name] as const));
  const historyEntries = historyQuery.data?.entries ?? [];
  const accountByProfile = new Map(
    (accountsQuery.data?.accounts ?? []).map((account) => [account.profileId, account] as const),
  );
  const parsedPort = Number(portDraft);
  const portValid = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535;
  const portChanged = !!settings && parsedPort !== settings.port;

  const statusVariant = settings?.status === 'listening' ? 'default' : settings ? 'destructive' : 'secondary';

  return (
    <div className="space-y-4">
      {settingsQuery.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : !settings ? (
        <p className="text-sm text-destructive">Could not load MCP settings.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="-ml-1.5 flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className={filterClass(view === 'settings')}
                onClick={() => setView('settings')}
              >
                Settings
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={filterClass(view === 'logs')}
                onClick={() => setView('logs')}
              >
                Logs
              </Button>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant={statusVariant}>{settings.status}</Badge>
              {settings.status !== 'listening' && settings.message ? (
                <span className="text-xs text-destructive">{settings.message}</span>
              ) : null}
              <Button
                variant="outline"
                size="icon-sm"
                title="Retry listener"
                onClick={() => retryListener.mutate()}
                disabled={retryListener.isPending}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Both views stay mounted and toggle with `hidden` so static tests and a11y keep both panels. (How / Why) */}
          <div className={view === 'settings' ? 'space-y-4' : 'hidden'}>
            <div className="rounded-sm border border-border p-3">
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="mcp-endpoint">Endpoint</Label>
                  <div className="flex items-center gap-2">
                    <Input id="mcp-endpoint" readOnly value={settings.endpoint} className="flex-1 font-mono text-xs" />
                    <CopyButton value={settings.endpoint} label="Endpoint" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="mcp-port">Port</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="mcp-port"
                      inputMode="numeric"
                      value={portDraft}
                      onChange={(event) => setPortDraft(event.target.value)}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      className="shrink-0"
                      onClick={() => updatePort.mutate(parsedPort)}
                      disabled={!portValid || !portChanged || updatePort.isPending}
                    >
                      Save
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="mcp-token">Token</Label>
                  <div className="flex items-center gap-2">
                    <Input id="mcp-token" readOnly value={settings.token} className="flex-1 font-mono text-xs" />
                    <CopyButton value={settings.token} label="Token" />
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="shrink-0"
                      title="Rotate token"
                      onClick={() => rotateToken.mutate()}
                      disabled={rotateToken.isPending}
                    >
                      <RotateCw className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Enabled connections</p>
              {eligibleProfiles.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No supported connections yet. Create a profile, then enable it here.
                </p>
              ) : (
                <div className="divide-y rounded-sm border border-border">
                  {eligibleProfiles.map((profile) => (
                    <div key={profile.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{profile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {accountStatusLabel(profile, accountByProfile.get(profile.id))}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {profile.kind === KIND.SQLITE ? (
                          <span className="text-xs text-muted-foreground">File access is read-only</span>
                        ) : accountByProfile.get(profile.id)?.state ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const cleanupPending =
                                accountByProfile.get(profile.id)?.state ===
                                MCP_MANAGED_ACCOUNT_STATE.LOCAL_CLEANUP_PENDING;
                              const message = cleanupPending
                                ? `Retry local cleanup for “${profile.database ?? profile.name}”? Its database account is already revoked.`
                                : `Revoke the managed database account for “${profile.database ?? profile.name}”?`;
                              if (window.confirm(message)) revokeAccount.mutate(profile.id);
                            }}
                            disabled={revokeAccount.isPending}
                          >
                            {accountByProfile.get(profile.id)?.state === MCP_MANAGED_ACCOUNT_STATE.LOCAL_CLEANUP_PENDING
                              ? 'Retry cleanup'
                              : 'Revoke'}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const database = profile.database ?? 'the selected database';
                              if (
                                window.confirm(
                                  `Create a dedicated read-only account with access to ${database}? KamehaDB will use this profile’s saved credentials only to create and revoke that account.`,
                                )
                              ) {
                                createAccount.mutate(profile.id);
                              }
                            }}
                            disabled={createAccount.isPending || !profile.database}
                          >
                            Create read-only account
                          </Button>
                        )}
                        <Switch
                          checked={profile.mcpEnabled}
                          disabled={
                            toggleProfile.isPending ||
                            (!profile.mcpEnabled &&
                              profile.kind !== KIND.SQLITE &&
                              (accountByProfile.get(profile.id)?.state !== 'ready' ||
                                !accountByProfile.get(profile.id)?.credentialAvailable))
                          }
                          onCheckedChange={(checked) => toggleProfile.mutate({ id: profile.id, enabled: checked })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Client setup</p>
              <p className="text-xs text-muted-foreground">
                Copy a snippet into the matching client. KamehaDB never edits client config files.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="-ml-1.5 flex flex-wrap items-center gap-1">
                  {snippets.map((snippet) => (
                    <Button
                      key={snippet.label}
                      variant="ghost"
                      size="sm"
                      className={filterClass(snippet.label === activeSnippet?.label)}
                      onClick={() => setClientLabel(snippet.label)}
                    >
                      {snippet.label}
                    </Button>
                  ))}
                </div>
                {activeSnippet ? (
                  <CopyButton value={activeSnippet.content} label={`${activeSnippet.label} config`} />
                ) : null}
              </div>

              {activeSnippet ? (
                <pre className="overflow-auto rounded-sm border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                  {activeSnippet.content}
                </pre>
              ) : null}
            </div>
          </div>

          <div className={view === 'logs' ? 'space-y-3' : 'hidden'}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">MCP call history</p>
                <p className="max-w-2xl text-xs text-muted-foreground">
                  Tool inputs are stored locally in plain text for 30 days. Returned database rows and documents are not
                  stored.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  aria-label="Record MCP call history"
                  checked={settings.historyEnabled}
                  disabled={setHistoryEnabled.isPending}
                  onCheckedChange={(enabled) => setHistoryEnabled.mutate(enabled)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (window.confirm('Clear all saved MCP call history?')) clearHistory.mutate();
                  }}
                  disabled={clearHistory.isPending || historyEntries.length === 0}
                >
                  Clear history
                </Button>
              </div>
            </div>

            {historyQuery.isLoading ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : historyQuery.isError ? (
              <p className="text-xs text-destructive">Could not load MCP call history.</p>
            ) : historyEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No MCP tool calls have been recorded.</p>
            ) : (
              <div className="max-h-[32rem] divide-y overflow-auto rounded-sm border border-border">
                {historyEntries.map((entry) => (
                  <div key={entry.id} className="space-y-2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {profileNames.get(entry.profileId) ?? entry.profileId}
                      </span>
                      <Badge variant={entry.status === 'success' ? 'default' : 'destructive'}>{entry.status}</Badge>
                      {entry.errorCode ? <Badge variant="outline">{entry.errorCode}</Badge> : null}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(entry.executedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{entry.toolName}</span>
                      <span>{entry.durationMs} ms</span>
                      <span>Items: {entry.itemCount ?? '—'}</span>
                      {entry.truncated ? <span>Truncated</span> : null}
                    </div>
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-muted/50 p-2 font-mono text-xs leading-relaxed">
                      {JSON.stringify(entry.input, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function accountStatusLabel(
  profile: { kind: string; database?: string },
  account: McpManagedAccountStatus | undefined,
): string {
  if (profile.kind === KIND.SQLITE) return 'Read-only file connection';
  if (!account?.state) return 'No managed account';
  if (account.state === 'prepared') return 'Setup incomplete — revoke to discard';
  if (account.state === 'provisioning') return 'Setting up account';
  if (account.state === 'recovery_required') return 'Setup interrupted — revoke required';
  if (account.state === 'revoke_failed') return 'Revoke failed — retry required';
  if (account.state === MCP_MANAGED_ACCOUNT_STATE.LOCAL_CLEANUP_PENDING) {
    return 'Database account revoked — local cleanup pending';
  }
  return account.credentialAvailable ? 'Ready' : 'Local credential unavailable — revoke and recreate';
}
