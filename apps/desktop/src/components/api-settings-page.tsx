import { useEffect, useState, useMemo, type ReactNode } from 'react';
import { ArrowLeft, Bot, Cloud, Loader2, Save, ServerCog, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { navigateTo } from '@/store';
import { useAISettings, useSaveAISettings } from '@/hooks/use-ai-chat';
import type { AIProvider, AIProviderConfig, AISettings } from '@kamehadb/shared';

const PROVIDER_ORDER: AIProvider[] = ['ollama-local', 'ollama-cloud', 'openai', '9router'];

const PROVIDER_META: Record<
  AIProvider,
  {
    label: string;
    description: string;
    modelPlaceholder: string;
    baseUrlPlaceholder: string;
    icon: typeof Bot;
  }
> = {
  'ollama-local': {
    label: 'Ollama Local',
    description: 'Run models on this machine with the local Ollama daemon.',
    modelPlaceholder: 'llama3.1',
    baseUrlPlaceholder: 'http://localhost:11434/v1',
    icon: ServerCog,
  },
  'ollama-cloud': {
    label: 'Ollama Cloud',
    description: 'Use a remote Ollama-compatible endpoint with your API token.',
    modelPlaceholder: 'llama3.1:70b',
    baseUrlPlaceholder: 'https://your-ollama-endpoint/v1',
    icon: Cloud,
  },
  openai: {
    label: 'OpenAI',
    description: 'Direct OpenAI API access for GPT models.',
    modelPlaceholder: 'gpt-4o',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    icon: Sparkles,
  },
  '9router': {
    label: '9Router',
    description: 'OpenAI-compatible router endpoint for model routing.',
    modelPlaceholder: 'openai/gpt-4o',
    baseUrlPlaceholder: 'https://router.example.com/v1',
    icon: Bot,
  },
};

function createEmptySettings(): AISettings {
  return {
    activeProvider: 'openai',
    providers: {
      'ollama-local': {
        enabled: false,
        model: 'llama3.1',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
      },
      'ollama-cloud': {
        enabled: false,
        model: '',
        baseUrl: '',
        apiKey: '',
      },
      openai: {
        enabled: false,
        model: 'gpt-4o',
        baseUrl: '',
        apiKey: '',
      },
      '9router': {
        enabled: false,
        model: '',
        baseUrl: '',
        apiKey: '',
      },
    },
  };
}

function normalizeSettings(settings: AISettings): AISettings {
  const base = createEmptySettings();
  for (const provider of PROVIDER_ORDER) {
    const config = settings.providers[provider] ?? base.providers[provider];
    base.providers[provider] = {
      enabled: Boolean(config.enabled),
      model: config.model ?? '',
      baseUrl: config.baseUrl ?? '',
      apiKey: config.apiKey ?? '',
    };
  }
  base.activeProvider = settings.activeProvider;
  return base;
}

function providerNeedsApiKey(provider: AIProvider) {
  return provider !== 'ollama-local';
}

function providerNeedsBaseUrl(provider: AIProvider) {
  return provider === 'ollama-cloud' || provider === '9router';
}

function getProviderStatus(provider: AIProvider, config: AIProviderConfig) {
  if (!config.enabled) return 'Not configured';
  if (!config.model.trim()) return 'Needs model';
  if (providerNeedsApiKey(provider) && !config.apiKey?.trim()) return 'Missing API key';
  if (providerNeedsBaseUrl(provider) && !config.baseUrl?.trim()) return 'Needs base URL';
  return 'Configured';
}

function getSetActiveBlockedReason(provider: AIProvider, config: AIProviderConfig, isAlreadyActive: boolean) {
  if (isAlreadyActive) return 'This provider is already active.';
  if (!config.enabled) return 'Enable this provider before making it active.';
  const status = getProviderStatus(provider, config);
  if (status !== 'Configured') return `Complete this provider setup first: ${status.toLowerCase()}.`;
  return null;
}

function Field({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function ApiSettingsPage() {
  const { data: savedSettings, isLoading } = useAISettings();
  const saveSettings = useSaveAISettings();
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('openai');
  const [draftSettings, setDraftSettings] = useState<AISettings>(createEmptySettings());
  const [savedSnapshot, setSavedSnapshot] = useState<AISettings>(createEmptySettings());

  useEffect(() => {
    if (!savedSettings) return;
    const normalized = normalizeSettings(savedSettings);
    setDraftSettings(normalized);
    setSavedSnapshot(normalized);
    setSelectedProvider(normalized.activeProvider);
  }, [savedSettings]);

  const selectedConfig = draftSettings.providers[selectedProvider];
  const activeConfig = draftSettings.providers[draftSettings.activeProvider];
  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(draftSettings) !== JSON.stringify(savedSnapshot),
    [draftSettings, savedSnapshot],
  );

  function updateProvider(provider: AIProvider, updates: Partial<AIProviderConfig>) {
    setDraftSettings((current) => ({
      ...current,
      providers: {
        ...current.providers,
        [provider]: {
          ...current.providers[provider],
          ...updates,
        },
      },
    }));
  }

  function resetSelectedProvider() {
    setDraftSettings((current) => ({
      ...current,
      providers: {
        ...current.providers,
        [selectedProvider]: { ...savedSnapshot.providers[selectedProvider] },
      },
    }));
  }

  async function handleSave() {
    const payload = normalizeSettings(draftSettings);
    await saveSettings.mutateAsync(payload);
    setSavedSnapshot(payload);
    setDraftSettings(payload);
  }

  const SelectedIcon = PROVIDER_META[selectedProvider].icon;
  const activeStatus = getProviderStatus(draftSettings.activeProvider, activeConfig);
  const selectedStatus = getProviderStatus(selectedProvider, selectedConfig);
  const setActiveBlockedReason = getSetActiveBlockedReason(
    selectedProvider,
    selectedConfig,
    selectedProvider === draftSettings.activeProvider,
  );

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent hover:scrollbar-thumb-border/80">
      <div className="border-b border-border">
        <div className="flex flex-wrap items-start gap-3 px-5 py-4">
          <Button variant="ghost" size="icon-sm" onClick={() => navigateTo('workspace')} title="Back to workspace">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">API Settings</h1>
              <Badge variant="outline" className="bg-background/70 text-xs">
                Local user profile
              </Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Manage provider credentials for the current desktop user. You can keep multiple providers ready and switch
              the active one without losing drafts.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/80 px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-primary" />
              <span className="text-sm font-medium">{PROVIDER_META[draftSettings.activeProvider].label}</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {activeStatus}
            </Badge>
            <span className="text-xs text-muted-foreground">{activeConfig?.model || 'No model'}</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="w-full shrink-0 border-b border-border bg-muted/5 lg:w-55 lg:border-r lg:border-b-0">
            <div className="space-y-1 p-3">
              {PROVIDER_ORDER.map((provider) => {
                const meta = PROVIDER_META[provider];
                const status = getProviderStatus(provider, draftSettings.providers[provider]);
                const Icon = meta.icon;
                const isSelected = provider === selectedProvider;
                const isActive = provider === draftSettings.activeProvider;

                return (
                  <button
                    key={provider}
                    onClick={() => setSelectedProvider(provider)}
                    className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                      isSelected ? 'bg-background shadow-sm ring-1 ring-inset ring-border' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div
                      className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground group-hover:bg-muted'
                      }`}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium" title={meta.label}>
                          {meta.label}
                        </span>
                        {isActive && <span className="size-1.5 rounded-full bg-primary shrink-0" />}
                      </div>
                      <div className="truncate text-xs text-muted-foreground" title={status}>
                        {status}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 px-5 py-5">
              <div className="space-y-4">
                {/* Provider Header */}
                <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <SelectedIcon className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">{PROVIDER_META[selectedProvider].label}</h2>
                      <p className="text-xs text-muted-foreground">{selectedStatus}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {selectedProvider !== draftSettings.activeProvider && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDraftSettings((current) => ({
                            ...current,
                            activeProvider: selectedProvider,
                          }))
                        }
                        disabled={setActiveBlockedReason !== null}
                      >
                        Set Active
                      </Button>
                    )}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={selectedConfig.enabled}
                      aria-label={`${PROVIDER_META[selectedProvider].label} toggle`}
                      onClick={() => updateProvider(selectedProvider, { enabled: !selectedConfig.enabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        selectedConfig.enabled ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${
                          selectedConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="rounded-xl border border-border/50 bg-card p-4 space-y-4">
                  <Field label="Model" description="The default model for AI chat.">
                    <Input
                      value={selectedConfig.model}
                      onChange={(e) => updateProvider(selectedProvider, { model: e.target.value })}
                      placeholder={PROVIDER_META[selectedProvider].modelPlaceholder}
                      className="h-9"
                    />
                  </Field>

                  <Field
                    label="Base URL"
                    description={
                      selectedProvider === 'openai'
                        ? 'Leave blank for official OpenAI endpoint.'
                        : selectedProvider === 'ollama-local'
                          ? 'Defaults to localhost if unchanged.'
                          : 'Required for remote endpoints.'
                    }
                  >
                    <Input
                      value={selectedConfig.baseUrl ?? ''}
                      onChange={(e) => updateProvider(selectedProvider, { baseUrl: e.target.value })}
                      placeholder={PROVIDER_META[selectedProvider].baseUrlPlaceholder}
                      className="h-9"
                    />
                  </Field>

                  {providerNeedsApiKey(selectedProvider) ? (
                    <Field label="API Key" description="Stored locally. Sent only to the selected provider.">
                      <Input
                        type="password"
                        value={selectedConfig.apiKey ?? ''}
                        onChange={(e) => updateProvider(selectedProvider, { apiKey: e.target.value })}
                        placeholder="sk-..."
                        className="h-9"
                      />
                    </Field>
                  ) : null}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-4 py-3">
                  <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={resetSelectedProvider}>
                      Reset
                    </Button>
                    <span className={`text-xs ${hasUnsavedChanges ? 'text-muted-foreground' : 'text-primary'}`}>
                      {hasUnsavedChanges ? 'Unsaved changes' : 'Saved'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDraftSettings(savedSnapshot);
                        setSelectedProvider(savedSnapshot.activeProvider);
                      }}
                      disabled={!hasUnsavedChanges || saveSettings.isPending}
                    >
                      Discard
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={!hasUnsavedChanges || saveSettings.isPending}>
                      {saveSettings.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
