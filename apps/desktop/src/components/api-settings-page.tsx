import { useEffect, useReducer, useMemo, useCallback, type ReactNode } from 'react';
import * as React from 'react';
import { ArrowLeft, Bot, Cloud, RefreshCw, Save, ServerCog, Sparkles } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    description: 'Self-hosted or remote OpenAI-compatible 9Router endpoint for model routing.',
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

function getProviderAvailabilityStatus(provider: AIProvider, config: AIProviderConfig, isActive: boolean): string {
  if (isActive) return 'Active';
  const status = getProviderStatus(provider, config);
  return status === 'Configured' ? 'Inactive' : status;
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
    case 'setActiveProvider':
      return {
        ...state,
        draft: {
          ...state.draft,
          activeProvider: action.provider,
          providers: Object.fromEntries(
            PROVIDER_ORDER.map((provider) => [
              provider,
              {
                ...state.draft.providers[provider],
                enabled: provider === action.provider,
              },
            ]),
          ) as AISettings['providers'],
        },
      };
    case 'updateProvider':
      return {
        ...state,
        draft: {
          ...state.draft,
          providers: {
            ...state.draft.providers,
            [action.provider]: {
              ...state.draft.providers[action.provider],
              ...action.updates,
            },
          },
        },
      };
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

function ApiSettingsHeader({ draft }: { draft: AISettings }) {
  const activeConfig = draft.providers[draft.activeProvider];
  const activeStatus = getProviderAvailabilityStatus(draft.activeProvider, activeConfig, true);
  return (
    <div className="border-b border-border">
      <div className="flex flex-wrap items-start px-5 py-4 gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigateTo('workspace')} title="Back to workspace">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">API Settings</h1>
            <Badge variant="outline" className="text-xs bg-background/70">
              Local user profile
            </Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Manage provider credentials for the current desktop user. You can keep multiple providers ready and switch
            the active one without losing drafts.
          </p>
        </div>
        <div className="flex items-center px-4 py-2 bg-background/80 rounded-xl border-border/50 gap-3 border">
          <div className="flex items-center gap-2">
            <div className="size-2 bg-primary rounded-full" />
            <span className="text-sm font-medium">{PROVIDER_META[draft.activeProvider].label}</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {activeStatus}
          </Badge>
          <span className="text-xs text-muted-foreground">{activeConfig?.model || 'No model'}</span>
        </div>
      </div>
    </div>
  );
}

function ProviderSidebar({
  draft,
  selectedProvider,
  onSelect,
}: {
  draft: AISettings;
  selectedProvider: AIProvider;
  onSelect: (p: AIProvider) => void;
}) {
  return (
    <aside className="w-full bg-muted/5 border-b border-border shrink-0 lg:w-55 lg:border-r lg:border-b-0">
      <div className="p-3 space-y-1">
        {PROVIDER_ORDER.map((provider) => {
          const meta = PROVIDER_META[provider];
          const isActive = provider === draft.activeProvider;
          const status = getProviderAvailabilityStatus(provider, draft.providers[provider], isActive);
          const Icon = meta.icon;
          const isSelected = provider === selectedProvider;

          return (
            <Button
              key={provider}
              variant="ghost"
              onClick={() => onSelect(provider)}
              className={`group w-full h-auto justify-start font-normal gap-3 py-2 ${
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
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate" title={meta.label}>
                    {meta.label}
                  </span>
                  {isActive ? (
                    <Badge variant="default" className="px-1.5 h-5 text-xs">
                      Active
                    </Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground truncate" title={status}>
                  {status}
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </aside>
  );
}

function ProviderHeader({
  selectedProvider,
  config,
  isActive,
  onSetActive,
}: {
  selectedProvider: AIProvider;
  config: AIProviderConfig;
  isActive: boolean;
  onSetActive: () => void;
}) {
  const SelectedIcon = PROVIDER_META[selectedProvider].icon;
  const status = getProviderAvailabilityStatus(selectedProvider, config, isActive);
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-card rounded-xl border-border/50 border">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-9 text-primary bg-primary/10 rounded-lg">
          <SelectedIcon className="size-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{PROVIDER_META[selectedProvider].label}</h2>
          <p className="text-xs text-muted-foreground">{status}</p>
        </div>
      </div>
      {isActive ? (
        <Badge variant="default" className="text-xs">
          Active
        </Badge>
      ) : (
        <Button variant="outline" size="sm" onClick={onSetActive}>
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
    <div className="p-4 bg-card rounded-xl border-border/50 border space-y-4">
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
              <SelectTrigger className="flex-1 h-9">
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
              className="flex-1 h-9"
            />
          )}
          <Button
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
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
          className="h-9"
        />
      </Field>

      {providerNeedsApiKey(selectedProvider) ? (
        <Field label="API Key" description="Stored locally. Sent only to the selected provider.">
          <Input
            type="password"
            value={config.apiKey ?? ''}
            onChange={(e) => onUpdateField({ apiKey: e.target.value })}
            placeholder="sk-..."
            className="h-9"
          />
        </Field>
      ) : null}
    </div>
  );
}

function SettingsFooter({
  hasUnsavedChanges,
  isSaving,
  onReset,
  onDiscard,
  onSave,
}: {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onReset: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-card rounded-xl border-border/50 border">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onReset}>
          Reset
        </Button>
        <span className={`text-xs ${hasUnsavedChanges ? 'text-muted-foreground' : 'text-primary'}`}>
          {hasUnsavedChanges ? 'Unsaved changes' : 'Saved'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onDiscard} disabled={!hasUnsavedChanges || isSaving}>
          Discard
        </Button>
        <Button size="sm" onClick={onSave} disabled={!hasUnsavedChanges || isSaving}>
          {isSaving ? <Spinner size="sm" className="size-3.5" /> : <Save className="size-3.5" />}
          Save
        </Button>
      </div>
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
  const [prevSavedSettings, setPrevSavedSettings] = React.useState(savedSettings);
  if (savedSettings !== prevSavedSettings) {
    setPrevSavedSettings(savedSettings);
    if (savedSettings) {
      const normalized = normalizeSettings(savedSettings);
      dispatch({ type: 'loadFromServer', settings: normalized });
    }
  }

  const selectedConfig = state.draft.providers[state.selectedProvider];
  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(state.draft) !== JSON.stringify(state.savedSnapshot),
    [state.draft, state.savedSnapshot],
  );

  const [availableModels, setAvailableModels] = useReducer((_: string[], next: string[]) => next, []);
  const [modelsLoading, setModelsLoading] = useReducer((_: boolean, next: boolean) => next, false);

  const modelsWithCustom = useMemo(() => {
    const savedModel = selectedConfig.model;
    if (!savedModel || availableModels.includes(savedModel)) {
      return availableModels;
    }
    return [savedModel, ...availableModels];
  }, [availableModels, selectedConfig.model]);

  // Fetch models when the base URL changes. Each fetch has its own AbortController
  // so the in-flight request is cancelled on cleanup.
  const fetchModels = useCallback(
    async (signal: AbortSignal) => {
      const baseUrl = selectedConfig.baseUrl?.trim();
      if (!baseUrl) return;
      setModelsLoading(true);
      try {
        const headers: HeadersInit = {};
        if (selectedConfig.apiKey) {
          headers['Authorization'] = `Bearer ${selectedConfig.apiKey}`;
        }
        const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, { signal, headers });
        if (!res.ok) return;
        const data = (await res.json()) as { data?: { id: string }[] };
        const models = (data.data ?? []).flatMap((m) => (m.id ? [m.id] : []));
        setAvailableModels(models);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setAvailableModels([]);
      } finally {
        setModelsLoading(false);
      }
    },
    [selectedConfig.apiKey, selectedConfig.baseUrl],
  );

  useEffect(() => {
    const controller = new AbortController();
    setAvailableModels([]);
    if (selectedConfig.baseUrl?.trim()) {
      fetchModels(controller.signal);
    }
    return () => controller.abort();
  }, [state.selectedProvider, selectedConfig.baseUrl, fetchModels]);

  async function handleSave() {
    const payload = normalizeSettings(state.draft);
    await saveSettings.mutateAsync(payload);
    dispatch({ type: 'commit', savedSnapshot: payload });
  }

  return (
    <div className="flex flex-1 flex-col h-full min-w-0 bg-background overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent hover:scrollbar-thumb-border/80">
      <ApiSettingsHeader draft={state.draft} />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="flex flex-1 flex-col min-h-0 lg:flex-row">
          <ProviderSidebar
            draft={state.draft}
            selectedProvider={state.selectedProvider}
            onSelect={(p) => dispatch({ type: 'selectProvider', provider: p })}
          />

          <section className="flex flex-1 flex-col min-h-0">
            <div className="flex-1 px-5 py-5">
              <div className="space-y-4">
                <ProviderHeader
                  selectedProvider={state.selectedProvider}
                  config={selectedConfig}
                  isActive={state.selectedProvider === state.draft.activeProvider}
                  onSetActive={() => dispatch({ type: 'setActiveProvider', provider: state.selectedProvider })}
                />

                <ProviderForm
                  selectedProvider={state.selectedProvider}
                  config={selectedConfig}
                  modelsWithCustom={modelsWithCustom}
                  modelsLoading={modelsLoading}
                  onModelChange={(v) =>
                    dispatch({ type: 'updateProvider', provider: state.selectedProvider, updates: { model: v } })
                  }
                  onUpdateField={(updates) =>
                    dispatch({ type: 'updateProvider', provider: state.selectedProvider, updates })
                  }
                  onFetchModels={() => {
                    // Reuse the in-flight effect's logic by triggering a re-render via a
                    // no-op base-url touch. Easier: just call fetchModels directly.
                    const controller = new AbortController();
                    fetchModels(controller.signal);
                  }}
                  canFetchModels={!!selectedConfig.baseUrl?.trim()}
                />

                <SettingsFooter
                  hasUnsavedChanges={hasUnsavedChanges}
                  isSaving={saveSettings.isPending}
                  onReset={() => dispatch({ type: 'resetSelected', savedSnapshot: state.savedSnapshot })}
                  onDiscard={() => dispatch({ type: 'discard', savedSnapshot: state.savedSnapshot })}
                  onSave={handleSave}
                />
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
