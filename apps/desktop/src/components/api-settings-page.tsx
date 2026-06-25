import { useReducer, useMemo, useCallback } from 'react';
import * as React from 'react';
import { ArrowLeft, Check, EyeOff, Eye, RefreshCw, Route, Save } from 'lucide-react';
import { Ollama as OllamaLogo, OpenAI as OpenAILogo } from '@lobehub/icons';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { navigateTo } from '@/store';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useAISettings, useSaveAISettings } from '@/hooks/use-ai-chat';
import type { AIProvider, AIProviderConfig, AISettings } from '@kamehadb/shared';

const PROVIDER_ORDER: AIProvider[] = ['ollama-local', 'ollama-cloud', 'openai', '9router'];

type ProviderIconProps = { className?: string };

type ProviderIcon = React.ComponentType<ProviderIconProps>;

const PROVIDER_META: Record<
  AIProvider,
  {
    label: string;
    description: string;
    modelPlaceholder: string;
    baseUrlPlaceholder: string;
    icon: ProviderIcon;
  }
> = {
  'ollama-local': {
    label: 'Ollama Local',
    description: 'Run models on this machine with the local Ollama daemon.',
    modelPlaceholder: 'llama3.1',
    baseUrlPlaceholder: 'http://localhost:11434/v1',
    icon: (props: ProviderIconProps) => <OllamaLogo size={20} className={props.className} />,
  },
  'ollama-cloud': {
    label: 'Ollama Cloud',
    description: 'Use a remote Ollama-compatible endpoint with your API token.',
    modelPlaceholder: 'llama3.1:70b',
    baseUrlPlaceholder: 'https://your-ollama-endpoint/v1',
    icon: (props: ProviderIconProps) => <OllamaLogo size={20} className={props.className} />,
  },
  openai: {
    label: 'OpenAI',
    description: 'Direct OpenAI API access for GPT models.',
    modelPlaceholder: 'gpt-4o',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    icon: (props: ProviderIconProps) => <OpenAILogo size={20} className={props.className} />,
  },
  '9router': {
    label: '9Router',
    description: 'Self-hosted or remote OpenAI-compatible 9Router endpoint for model routing.',
    modelPlaceholder: 'openai/gpt-4o',
    baseUrlPlaceholder: 'https://router.example.com/v1',
    icon: (props: ProviderIconProps) => <Route className={props.className} />,
  },
};

function createEmptySettings(): AISettings {
  return {
    activeProvider: 'openai',
    providers: {
      'ollama-local': { enabled: false, model: 'llama3.1', baseUrl: 'http://localhost:11434/v1', apiKey: '' },
      'ollama-cloud': { enabled: false, model: '', baseUrl: '', apiKey: '' },
      openai: { enabled: false, model: 'gpt-4o', baseUrl: '', apiKey: '' },
      '9router': { enabled: false, model: '', baseUrl: '', apiKey: '' },
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
  if (!config.enabled) return { label: 'Not configured', severity: 'muted' as const };
  if (!config.model.trim()) return { label: 'Needs model', severity: 'warning' as const };
  if (providerNeedsApiKey(provider) && !config.apiKey?.trim())
    return { label: 'Missing API key', severity: 'warning' as const };
  if (providerNeedsBaseUrl(provider) && !config.baseUrl?.trim())
    return { label: 'Needs base URL', severity: 'warning' as const };
  return { label: 'Ready', severity: 'good' as const };
}

// ─── Reducer ──────────────────────────────────────────────────────────

type SettingsState = {
  selectedProvider: AIProvider;
  draft: AISettings;
  savedSnapshot: AISettings;
};

type SettingsAction =
  | { type: 'loadFromServer'; settings: AISettings }
  | { type: 'selectProvider'; provider: AIProvider }
  | { type: 'setActiveProvider'; provider: AIProvider }
  | { type: 'updateProvider'; provider: AIProvider; updates: Partial<AIProviderConfig> }
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
            PROVIDER_ORDER.map((p) => [p, { ...state.draft.providers[p], enabled: p === action.provider }]),
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
            [action.provider]: { ...state.draft.providers[action.provider], ...action.updates },
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

// ─── Provider List (sidebar) ──────────────────────────────────────────

function ProviderList({
  draft,
  selectedProvider,
  onSelect,
}: {
  draft: AISettings;
  selectedProvider: AIProvider;
  onSelect: (p: AIProvider) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {PROVIDER_ORDER.map((provider) => {
        const isActive = provider === draft.activeProvider;
        const isSelected = provider === selectedProvider;
        const status = getProviderStatus(provider, draft.providers[provider]);
        const Icon = PROVIDER_META[provider].icon;

        return (
          <Button
            key={provider}
            variant="ghost"
            onClick={() => onSelect(provider)}
            className={`group h-auto flex items-center gap-2.5 rounded-lg px-3 py-3 text-left transition-all ${
              isSelected ? 'bg-accent shadow-sm ring-1 ring-border' : 'hover:bg-accent/60'
            }`}
          >
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                isSelected
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-muted/30 text-muted-foreground'
              }`}
            >
              <Icon className="size-4" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={`truncate text-xs font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {PROVIDER_META[provider].label}
              </span>
              <span
                className={`truncate text-[10px] leading-none ${
                  status.severity === 'good'
                    ? 'text-green-600 dark:text-green-400'
                    : status.severity === 'warning'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground/50'
                }`}
              >
                {status.label}
              </span>
            </div>
            {isActive && (
              <Badge
                variant="outline"
                className="size-4 shrink-0 items-center justify-center rounded-full border-green-500/20 bg-green-500/10 p-0"
              >
                <Check className="size-2.5 text-green-600 dark:text-green-400" />
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}

// ─── Provider Form ────────────────────────────────────────────────────

function ProviderForm({
  selectedProvider,
  config,
  isActive,
  onSetActive,
  modelsWithCustom,
  modelsLoading,
  onModelChange,
  onUpdateField,
  onFetchModels,
  canFetchModels,
}: {
  selectedProvider: AIProvider;
  config: AIProviderConfig;
  isActive: boolean;
  onSetActive: () => void;
  modelsWithCustom: string[];
  modelsLoading: boolean;
  onModelChange: (v: string) => void;
  onUpdateField: (updates: Partial<AIProviderConfig>) => void;
  onFetchModels: () => void;
  canFetchModels: boolean;
}) {
  const [showKey, setShowKey] = React.useState(false);
  const status = getProviderStatus(selectedProvider, config);
  const SelectedIcon = PROVIDER_META[selectedProvider].icon;

  return (
    <div className="flex flex-col gap-5">
      {/* Provider header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-muted-foreground/5 border border-border/20 density-compact:rounded-lg">
            <SelectedIcon className="size-5 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">{PROVIDER_META[selectedProvider].label}</h2>
            <p className="text-xs text-muted-foreground/60">{PROVIDER_META[selectedProvider].description}</p>
          </div>
        </div>
        {isActive ? (
          <Badge
            variant="outline"
            className="gap-1.5 rounded-full border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400"
          >
            <span className="size-1.5 rounded-full bg-green-500" />
            Active
          </Badge>
        ) : (
          <Button variant="outline" size="sm" onClick={onSetActive} className="gap-1.5">
            <Check className="size-3" />
            Set Active
          </Button>
        )}
      </div>

      {/* Status badge */}
      <Badge
        variant="outline"
        className={`w-fit gap-2 rounded-lg px-3 py-2 text-xs ${
          status.severity === 'good'
            ? 'border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400'
            : status.severity === 'warning'
              ? 'border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400'
              : 'border-border/30 bg-muted/20 text-muted-foreground'
        }`}
      >
        <span
          className={`size-1.5 rounded-full ${
            status.severity === 'good'
              ? 'bg-green-500'
              : status.severity === 'warning'
                ? 'bg-amber-400'
                : 'bg-muted-foreground/30'
          }`}
        />
        {status.label}
      </Badge>

      {/* Form fields */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-foreground/70">Model</Label>
          <div className="flex gap-2">
            {modelsWithCustom.length > 0 ? (
              <Select
                value={modelsWithCustom.includes(config.model) ? config.model : undefined}
                onValueChange={(v) => {
                  if (v && v !== '__custom') onModelChange(v);
                }}
              >
                <SelectTrigger className="flex-1">
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
                className="flex-1"
              />
            )}
            {canFetchModels && (
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={onFetchModels}
                disabled={modelsLoading}
                title="Fetch available models"
              >
                {modelsLoading ? <Spinner size="sm" /> : <RefreshCw className="size-3.5" />}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-foreground/70">Base URL</Label>
          <Input
            value={config.baseUrl ?? ''}
            onChange={(e) => onUpdateField({ baseUrl: e.target.value })}
            placeholder={PROVIDER_META[selectedProvider].baseUrlPlaceholder}
          />
        </div>

        {providerNeedsApiKey(selectedProvider) && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground/70">API Key</Label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={config.apiKey ?? ''}
                onChange={(e) => onUpdateField({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="pr-8"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-1 text-muted-foreground hover:text-foreground"
                style={{ top: '50%', translate: '0 -50%' }}
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────

function SettingsFooter({
  hasUnsavedChanges,
  isSaving,
  onDiscard,
  onSave,
}: {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-background px-6 py-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block size-1.5 rounded-full transition-colors ${hasUnsavedChanges ? 'bg-amber-400' : 'bg-green-500'}`}
        />
        <span className="text-xs text-muted-foreground">
          {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onDiscard} disabled={!hasUnsavedChanges || isSaving}>
          Discard
        </Button>
        <Button size="sm" onClick={onSave} disabled={!hasUnsavedChanges || isSaving} className="gap-1.5">
          {isSaving ? <Spinner size="sm" /> : <Save className="size-3.5" />}
          Save
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────

export function ApiSettingsPage() {
  const { data: savedSettings, isLoading } = useAISettings();
  const saveSettings = useSaveAISettings();
  const [state, dispatch] = useReducer(settingsReducer, undefined, () => ({
    selectedProvider: 'openai' as AIProvider,
    draft: createEmptySettings(),
    savedSnapshot: createEmptySettings(),
  }));

  // Sync saved settings into reducer (inline, no effect)
  const [prevSavedSettings, setPrevSavedSettings] = React.useState<AISettings | undefined>(undefined);
  if (savedSettings !== prevSavedSettings) {
    setPrevSavedSettings(savedSettings);
    if (savedSettings) {
      dispatch({ type: 'loadFromServer', settings: normalizeSettings(savedSettings) });
    }
  }

  const selectedConfig = state.draft.providers[state.selectedProvider];
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
    enabled: !!selectedConfig.baseUrl?.trim(),
    staleTime: 0,
    gcTime: 0,
  });

  const availableModels = modelsData?.models ?? [];
  const modelsWithCustom = useMemo(() => {
    const savedModel = selectedConfig.model;
    if (!savedModel || availableModels.includes(savedModel)) return availableModels;
    return [savedModel, ...availableModels];
  }, [availableModels, selectedConfig.model]);

  const handleSave = useCallback(async () => {
    const payload = normalizeSettings(state.draft);
    await saveSettings.mutateAsync(payload);
    dispatch({ type: 'commit', savedSnapshot: payload });
  }, [state.draft, saveSettings]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {/* Top header bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-background via-background to-muted/20 px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => navigateTo('workspace')}
            title="Back to workspace"
            className="rounded-lg text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-base font-semibold tracking-tight">API Settings</h1>
            <p className="text-xs text-muted-foreground/70">Local user</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1">
            {/* Provider list sidebar */}
            <aside className="api-settings-sidebar w-56 shrink-0 border-r border-border bg-muted/20 overflow-y-auto px-4 py-6">
              <ProviderList
                draft={state.draft}
                selectedProvider={state.selectedProvider}
                onSelect={(p) => dispatch({ type: 'selectProvider', provider: p })}
              />
            </aside>

            {/* Form area */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <ProviderForm
                selectedProvider={state.selectedProvider}
                config={selectedConfig}
                isActive={state.selectedProvider === state.draft.activeProvider}
                onSetActive={() => dispatch({ type: 'setActiveProvider', provider: state.selectedProvider })}
                modelsWithCustom={modelsWithCustom}
                modelsLoading={modelsLoading}
                onModelChange={(v) =>
                  dispatch({ type: 'updateProvider', provider: state.selectedProvider, updates: { model: v } })
                }
                onUpdateField={(updates) =>
                  dispatch({ type: 'updateProvider', provider: state.selectedProvider, updates })
                }
                onFetchModels={() => refetchModels()}
                canFetchModels={!!selectedConfig.baseUrl?.trim()}
              />
            </div>
          </div>

          <SettingsFooter
            hasUnsavedChanges={hasUnsavedChanges}
            isSaving={saveSettings.isPending}
            onDiscard={() => dispatch({ type: 'discard', savedSnapshot: state.savedSnapshot })}
            onSave={handleSave}
          />
        </>
      )}
    </div>
  );
}
