import { useEffect, useMemo, useState } from 'react';
import { Copy, Plug, RefreshCw, RotateCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { isMcpSupportedKind } from '@kamehadb/shared';
import { toastError, toastSuccess } from '@/lib/toast';
import { useConnections } from '@/hooks/use-connections';
import {
  useMcpSettings,
  useRetryMcpListener,
  useRotateMcpToken,
  useSetConnectionMcpEnabled,
  useUpdateMcpPort,
} from '@/hooks/use-mcp-settings';

type Snippet = { label: string; content: string };

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
          mcp: { kamehadb: { type: 'remote', url: endpoint, headers: { Authorization: `Bearer ${token}` } } },
        },
        null,
        2,
      ),
    },
  ];
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => toastSuccess(`${label} copied`))
          .catch(() => toastError(`Failed to copy ${label}`));
      }}
    >
      <Copy className="size-3.5" />
      Copy
    </Button>
  );
}

export function McpSettingsSection() {
  const settingsQuery = useMcpSettings();
  const connectionsQuery = useConnections();
  const updatePort = useUpdateMcpPort();
  const retryListener = useRetryMcpListener();
  const rotateToken = useRotateMcpToken();
  const toggleProfile = useSetConnectionMcpEnabled();

  const settings = settingsQuery.data;
  const [portDraft, setPortDraft] = useState('');

  // Keep the editable port in sync with the persisted value without clobbering
  // in-progress typing after an unrelated refetch.
  useEffect(() => {
    if (settings) setPortDraft(String(settings.port));
  }, [settings?.port]);

  const snippets = useMemo(
    () => (settings ? buildSnippets(settings.endpoint, settings.token) : []),
    [settings?.endpoint, settings?.token],
  );

  const eligibleProfiles = (connectionsQuery.data ?? []).filter((profile) => isMcpSupportedKind(profile.kind));
  const parsedPort = Number(portDraft);
  const portValid = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535;
  const portChanged = !!settings && parsedPort !== settings.port;

  const statusVariant = settings?.status === 'listening' ? 'default' : settings ? 'destructive' : 'secondary';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Plug className="size-4" />
          MCP Server
        </CardTitle>
        <CardDescription>
          Expose selected connections to local AI clients over a read-only Model Context Protocol endpoint. Enable a
          profile with a separate read-only database account before using it here.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {settingsQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : !settings ? (
          <p className="text-sm text-destructive">Could not load MCP settings.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant={statusVariant}>{settings.status}</Badge>
              {settings.status !== 'listening' && settings.message ? (
                <span className="text-xs text-destructive">{settings.message}</span>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto gap-1.5"
                onClick={() => retryListener.mutate()}
                disabled={retryListener.isPending}
              >
                <RefreshCw className="size-3.5" />
                Retry
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
              <Label htmlFor="mcp-endpoint">Endpoint</Label>
              <Input id="mcp-endpoint" readOnly value={settings.endpoint} className="font-mono text-xs" />
              <CopyButton value={settings.endpoint} label="Endpoint" />
            </div>

            <div className="grid gap-2 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
              <Label htmlFor="mcp-port">Port</Label>
              <Input
                id="mcp-port"
                inputMode="numeric"
                value={portDraft}
                onChange={(event) => setPortDraft(event.target.value)}
              />
              <Button
                size="sm"
                onClick={() => updatePort.mutate(parsedPort)}
                disabled={!portValid || !portChanged || updatePort.isPending}
              >
                Save
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-[9rem_1fr_auto_auto] sm:items-center">
              <Label htmlFor="mcp-token">Token</Label>
              <Input id="mcp-token" readOnly value={settings.token} className="font-mono text-xs" />
              <CopyButton value={settings.token} label="Token" />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => rotateToken.mutate()}
                disabled={rotateToken.isPending}
              >
                <RotateCw className="size-3.5" />
                Rotate
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Enabled connections</p>
              {eligibleProfiles.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No supported connections yet. Create a profile, then enable it here.
                </p>
              ) : (
                <div className="divide-y rounded-md border">
                  {eligibleProfiles.map((profile) => (
                    <div key={profile.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{profile.name}</p>
                        <p className="text-xs text-muted-foreground">{profile.kind}</p>
                      </div>
                      <Switch
                        checked={profile.mcpEnabled}
                        disabled={toggleProfile.isPending}
                        onCheckedChange={(checked) => toggleProfile.mutate({ id: profile.id, enabled: checked })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Client setup</p>
              <p className="text-xs text-muted-foreground">
                Copy a snippet into the matching client. KamehaDB never edits client config files. Enabling a connection
                here does not change its database permissions.
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {snippets.map((snippet) => (
                  <div key={snippet.label} className="space-y-1.5 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{snippet.label}</span>
                      <CopyButton value={snippet.content} label={`${snippet.label} config`} />
                    </div>
                    <pre className="max-h-40 overflow-auto rounded bg-muted/50 p-2 text-[11px] leading-relaxed">
                      {snippet.content}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
