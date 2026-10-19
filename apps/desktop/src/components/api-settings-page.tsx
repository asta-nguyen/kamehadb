import { useReducer, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, RefreshCw, Router, Save } from 'lucide-react';
import { DeepSeek, Google, OpenAI } from 'developer-icons';
import { OllamaLogo } from '@/components/ollama-logo';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { navigateTo } from '@/store';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useAISettings, useSaveAISettings } from '@/hooks/use-ai-chat';
import { McpSettingsSection } from '@/components/mcp-settings-section';
import { UpdateSettingsSection } from '@/components/update-settings-section';
import type { AcpAgentId, AIProvider, AIProviderConfig, AISettings } from '@kamehadb/shared';
import { ACP_AGENT_LABELS, ACP_AGENTS } from '@kamehadb/shared';

const PROVIDER_ORDER: AIProvider[] = ['ollama-local', 'ollama-cloud', 'openai', '9router', 'deepseek', 'gemini'];

// Sentinel Select value meaning "use the KamehaDB model provider" (i.e. no ACP
// agent). ACP ids are a closed union, so a sentinel cannot collide with one.
const PROVIDER_BACKEND = '__provider__';

// developer-icons marks ship with baked brand fills; recolor them to the surrounding
// text color so they read in both themes and the selected tile state. (Why)
function tintedBrandIcon(Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>) {
  return function TintedBrandIcon(props: React.SVGProps<SVGSVGElement>) {
    return <Icon {...props} className={`[&_path]:fill-current ${props.className ?? ''}`} />;
  };
}

const PROVIDER_META: Record<
  AIProvider,
  {
    label: string;
    description: string;
    modelPlaceholder: string;
    baseUrlPlaceholder: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  }
> = {
  'ollama-local': {
    label: 'Ollama Local',
    description: 'Run models on this machine with the local Ollama daemon.',
    modelPlaceholder: 'llama3.1',
    baseUrlPlaceholder: 'http://localhost:11434/v1',
    icon: OllamaLogo,
  },
  'ollama-cloud': {
    label: 'Ollama Cloud',
    description: 'Use a remote Ollama-compatible endpoint with your API token.',
    modelPlaceholder: 'llama3.1:70b',
    baseUrlPlaceholder: 'https://your-ollama-endpoint/v1',
    icon: OllamaLogo,
  },
  openai: {
    label: 'OpenAI',
    description: 'Direct OpenAI API access for GPT models.',
    modelPlaceholder: 'gpt-4o',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    icon: tintedBrandIcon(OpenAI),
  },
  '9router': {
    label: '9Router',
    description: 'Self-hosted or remote OpenAI-compatible 9Router endpoint for model routing.',
    modelPlaceholder: 'openai/gpt-4o',
    baseUrlPlaceholder: 'https://router.example.com/v1',
    icon: Router,
  },
  deepseek: {
    label: 'DeepSeek',
    description: 'Direct DeepSeek API access for DeepSeek-V3 and DeepSeek-R1 models.',
    modelPlaceholder: 'deepseek-chat',
    baseUrlPlaceholder: 'https://api.deepseek.com/v1',
    icon: tintedBrandIcon(DeepSeek),
  },
  gemini: {
    label: 'Gemini',
    description: 'Google AI Studio API access for Gemini models.',
    modelPlaceholder: 'gemini-2.5-flash',
    baseUrlPlaceholder: 'https://generativelanguage.googleapis.com/v1beta/openai',
    icon: tintedBrandIcon(Google),
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
      deepseek: {
        enabled: false,
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: '',
      },
      gemini: {
        enabled: false,
        model: 'gemini-2.5-flash',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: '',
      },
    },
    activeChatAgent: null,
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
  base.activeChatAgent = settings.activeChatAgent ?? null;
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

// Problems always surface; a healthy tile reads simply Active or Inactive. (Why)
function getProviderAvailabilityStatus(provider: AIProvider, config: AIProviderConfig, isActive: boolean): string {
  const status = getProviderStatus(provider, config);
  if (status !== 'Configured') return status;
  return isActive ? 'Active' : 'Inactive';
}

function Field({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {description ? <p className="text-xs leading-snug text-muted-foreground">{description}</p> : null}
    </div>
  );
}

// Group the related draft/provider/snapshot state into one reducer so a single
// dispatch produces a single re-render instead of three.
type SettingsState = {
  selectedProvider: AIProvider;
  draft: AISettings;
  savedSnapshot: AISettings;
};

type SettingsAction =
  | { type: 'loadFromServer'; settings: AISettings }
  | { type: 'selectProvider'; provider: AIProvider }
  | { type: 'setActiveProvider'; provider: AIProvider }
  | { type: 'setActiveChatAgent'; agent: AcpAgentId | null }
  | {
      type: 'updateProvider';
      provider: AIProvider;
      updates: Partial<AIProviderConfig>;
    }
  | { type: 'resetSelected'; savedSnapshot: AISettings }
  | { type: 'discard'; savedSnapshot: AISettings }
  | { type: 'commit'; savedSnapshot: AISettings };

function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'loadFromServer':
      return {
        selectedProvider: action.settings.activeProvider,
        draft: action.settings,
        savedSnapshot: action.settings,
      };
    case 'selectProvider':
      return { ...state, selectedProvider: action.provider };
    case 'setActiveChatAgent':
      return { ...state, draft: { ...state.draft, activeChatAgent: action.agent } };
    case 'setActiveProvider':
      return {
        ...state,
        draft: {
          ...state.draft,
          activeProvider: action.provider,
          providers: {
            ...state.draft.providers,
            [action.provider]: {
              ...state.draft.providers[action.provider],
              enabled: true,
            },
          },
        },
      };
    case 'updateProvider': {
      const updated: AIProviderConfig = {
        ...state.draft.providers[action.provider],
        ...action.updates,
      };
      // Auto-enable when the provider has sufficient config so it
      // persists as 'Configured' even before being set as active.
      if (!updated.enabled && updated.model.trim()) {
        const needsKey = providerNeedsApiKey(action.provider);
        const needsUrl = providerNeedsBaseUrl(action.provider);
        if ((!needsKey || updated.apiKey?.trim()) && (!needsUrl || updated.baseUrl?.trim())) {
          updated.enabled = true;
        }
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          providers: {
            ...state.draft.providers,
            [action.provider]: updated,
          },
        },
      };
    }
    case 'resetSelected':
      return {
        ...state,
        draft: {
          ...state.draft,
          providers: {
            ...state.draft.providers,
            [state.selectedProvider]: { ...action.savedSnapshot.providers[state.selectedProvider] },
          },
        },
      };
    case 'discard':
      return { ...state, draft: action.savedSnapshot, selectedProvider: action.savedSnapshot.activeProvider };
    case 'commit':
      return { ...state, draft: action.savedSnapshot, savedSnapshot: action.savedSnapshot };
  }
}

function ApiSettingsHeader() {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
      <Button variant="ghost" size="icon-sm" onClick={() => navigateTo('workspace')} title="Back to workspace">
        <ArrowLeft className="size-4" />
      </Button>
      <span className="text-sm font-semibold">API Settings</span>
    </div>
  );
}

function ProviderHeader({
  selectedProvider,
  isActive,
  onSetActive,
}: {
  selectedProvider: AIProvider;
  isActive: boolean;
  onSetActive: () => void;
}) {
  const SelectedIcon = PROVIDER_META[selectedProvider].icon;
  return (
    <div className="mb-3 flex items-center gap-2">
      {/* The selected tile above already shows the provider name, so the panel header keeps only the icon. (Why) */}
      <div className="flex size-7 items-center justify-center rounded-sm bg-primary/10 text-primary">
        <SelectedIcon className="size-3.5" />
      </div>
      {isActive ? null : (
        <Button variant="outline" size="xs" className="ml-auto" onClick={onSetActive}>
          Set active
        </Button>
      )}
    </div>
  );
}

function ProviderForm({
  selectedProvider,
  config,
  modelsWithCustom,
  modelsLoading,
  onModelChange,
  onUpdateField,
  onFetchModels,
  canFetchModels,
}: {
  selectedProvider: AIProvider;
  config: AIProviderConfig;
  modelsWithCustom: string[];
  modelsLoading: boolean;
  onModelChange: (v: string) => void;
  onUpdateField: (updates: Partial<AIProviderConfig>) => void;
  onFetchModels: () => void;
  canFetchModels: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      <Field
        label="Model"
        description="The default model for AI chat. Select from available models or type a custom name."
      >
        <div className="flex gap-2">
          {modelsWithCustom.length > 0 ? (
            <Select
              value={modelsWithCustom.includes(config.model) ? config.model : undefined}
              onValueChange={(v) => {
                if (v && v !== '__custom') onModelChange(v);
              }}
            >
              <SelectTrigger className="h-7 flex-1">
                <SelectValue placeholder="Select a model..." />
              </SelectTrigger>
              <SelectContent>
                {modelsWithCustom.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
                <SelectItem value="__custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={config.model}
              onChange={(e) => onUpdateField({ model: e.target.value })}
              placeholder={PROVIDER_META[selectedProvider].modelPlaceholder}
              className="h-7 flex-1"
            />
          )}
          <Button
            variant="outline"
            size="icon-sm"
            className="shrink-0"
            onClick={onFetchModels}
            disabled={modelsLoading || !canFetchModels}
            title="Fetch available models"
          >
            {modelsLoading ? <Spinner size="sm" className="size-3.5" /> : <RefreshCw className="size-3.5" />}
          </Button>
        </div>
      </Field>

      <Field
        label="Base URL"
        description={
          selectedProvider === 'openai'
            ? 'Leave blank for official OpenAI endpoint.'
            : selectedProvider === 'ollama-local'
              ? 'Defaults to localhost if unchanged.'
              : selectedProvider === '9router'
                ? 'Required. Point this at your self-hosted or managed 9Router OpenAI-compatible endpoint.'
                : 'Required for remote endpoints.'
        }
      >
        <Input
          value={config.baseUrl ?? ''}
          onChange={(e) => onUpdateField({ baseUrl: e.target.value })}
          placeholder={PROVIDER_META[selectedProvider].baseUrlPlaceholder}
          className="h-7"
        />
      </Field>

      {providerNeedsApiKey(selectedProvider) ? (
        <Field label="API Key" description="Stored locally. Sent only to the selected provider.">
          <Input
            type="password"
            value={config.apiKey ?? ''}
            onChange={(e) => onUpdateField({ apiKey: e.target.value })}
            placeholder="sk-..."
            className="h-7"
          />
        </Field>
      ) : null}
    </div>
  );
}

export function ApiSettingsPage() {
  const { data: savedSettings, isLoading } = useAISettings();
  const saveSettings = useSaveAISettings();
  const [state, dispatch] = useReducer(settingsReducer, undefined, () => ({
    selectedProvider: 'openai' as AIProvider,
    draft: createEmptySettings(),
    savedSnapshot: createEmptySettings(),
  }));

  // Reset the draft and snapshot whenever the server's saved settings change.
  // Adjusting state inline (per react.dev/learn/you-might-not-need-an-effect)
  // so we don't briefly render stale data.
  const [prevSavedSettings, setPrevSavedSettings] = useState(savedSettings);
  if (savedSettings !== prevSavedSettings) {
    setPrevSavedSettings(savedSettings);
    if (savedSettings) {
      const normalized = normalizeSettings(savedSettings);
      dispatch({ type: 'loadFromServer', settings: normalized });
    }
  }

  const selectedProvider = state.selectedProvider;
  const selectedConfig = state.draft.providers[selectedProvider];
  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(state.draft) !== JSON.stringify(state.savedSnapshot),
    [state.draft, state.savedSnapshot],
  );

  const {
    data: modelsData,
    isFetching: modelsLoading,
    refetch: refetchModels,
  } = useQuery({
    queryKey: ['available-models', selectedConfig.baseUrl?.trim() || '', selectedConfig.apiKey?.trim() || ''],
    queryFn: ({ signal }) =>
      api.fetchAvailableModels(
        selectedConfig.baseUrl?.trim() || '',
        selectedConfig.apiKey?.trim() || undefined,
        signal,
      ),
    enabled:
      !!selectedConfig.baseUrl?.trim() && (!providerNeedsApiKey(selectedProvider) || !!selectedConfig.apiKey?.trim()),
    staleTime: 0,
    gcTime: 0,
  });

  const availableModels = modelsData?.models ?? [];

  const modelsWithCustom = useMemo(() => {
    const savedModel = selectedConfig.model;
    if (!savedModel || availableModels.includes(savedModel)) {
      return availableModels;
    }
    return [savedModel, ...availableModels];
  }, [availableModels, selectedConfig.model]);

  async function handleSave() {
    const payload = normalizeSettings(state.draft);
    await saveSettings.mutateAsync(payload);
    dispatch({ type: 'commit', savedSnapshot: payload });
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <ApiSettingsHeader />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-6 px-4 py-4">
              <section className="space-y-2">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Chat Backend</h2>
                <div className="space-y-2 rounded-sm border border-border p-3">
                  <Field
                    label="Backend"
                    description="Use the KamehaDB model provider, or run a fixed local ACP agent command as the chat backend."
                  >
                    <Select
                      value={state.draft.activeChatAgent ?? PROVIDER_BACKEND}
                      onValueChange={(value) =>
                        dispatch({
                          type: 'setActiveChatAgent',
                          agent: value === PROVIDER_BACKEND ? null : (value as AcpAgentId),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={PROVIDER_BACKEND}>KamehaDB provider</SelectItem>
                        {ACP_AGENTS.map((agent) => (
                          <SelectItem key={agent} value={agent}>
                            {ACP_AGENT_LABELS[agent]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {state.draft.activeChatAgent && (
                    <p className="text-xs leading-snug text-muted-foreground">
                      Codex and Claude launch through <code className="rounded bg-muted px-1">npx</code> (Node.js 22+)
                      and may download their adapter on first use; OpenCode and Devin must already be installed locally.
                      The CLI keeps its own OS access and configured tools. Only your chat and read-only database
                      context are shared, and tool permissions appear in the chat.
                    </p>
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">AI Providers</h2>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                  {PROVIDER_ORDER.map((provider) => {
                    const meta = PROVIDER_META[provider];
                    const ProviderIcon = meta.icon;
                    const isActive = provider === state.draft.activeProvider;
                    const isSelected = provider === selectedProvider;
                    return (
                      <Button
                        key={provider}
                        variant="ghost"
                        onClick={() => dispatch({ type: 'selectProvider', provider })}
                        className={`h-auto w-full justify-start gap-2 border px-2 py-1.5 font-normal ${
                          isSelected ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'
                        }`}
                      >
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-sm ${
                            isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <ProviderIcon className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-xs font-medium">{meta.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {getProviderAvailabilityStatus(provider, state.draft.providers[provider], isActive)}
                          </span>
                        </span>
                      </Button>
                    );
                  })}
                </div>

                <div className="rounded-sm border border-border p-3">
                  <ProviderHeader
                    selectedProvider={selectedProvider}
                    isActive={selectedProvider === state.draft.activeProvider}
                    onSetActive={() => dispatch({ type: 'setActiveProvider', provider: selectedProvider })}
                  />
                  <ProviderForm
                    selectedProvider={selectedProvider}
                    config={selectedConfig}
                    modelsWithCustom={modelsWithCustom}
                    modelsLoading={modelsLoading}
                    onModelChange={(v) =>
                      dispatch({ type: 'updateProvider', provider: selectedProvider, updates: { model: v } })
                    }
                    onUpdateField={(updates) =>
                      dispatch({ type: 'updateProvider', provider: selectedProvider, updates })
                    }
                    onFetchModels={() => refetchModels()}
                    canFetchModels={
                      !!selectedConfig.baseUrl?.trim() &&
                      (!providerNeedsApiKey(selectedProvider) || !!selectedConfig.apiKey?.trim())
                    }
                  />
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">MCP Server</h2>
                <McpSettingsSection />
              </section>

              <section className="space-y-2">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Updates</h2>
                <UpdateSettingsSection />
              </section>
            </div>
          </div>

          {hasUnsavedChanges && (
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-background/95 px-4 py-1.5 backdrop-blur">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => dispatch({ type: 'resetSelected', savedSnapshot: state.savedSnapshot })}
              >
                Reset
              </Button>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Unsaved changes</span>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => dispatch({ type: 'discard', savedSnapshot: state.savedSnapshot })}
                >
                  Discard
                </Button>
                <Button size="xs" onClick={handleSave} disabled={saveSettings.isPending}>
                  {saveSettings.isPending ? <Spinner size="sm" className="size-3" /> : <Save className="size-3" />}
                  Save
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
