import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Bot, CheckCircle2, Cloud, Loader2, RotateCcw, Save, ServerCog, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { navigateTo } from "@/store";
import { useAISettings, useSaveAISettings } from "@/hooks/use-ai-chat";
import type { AIProvider, AIProviderConfig, AISettings } from "@kamehadb/shared";

const PROVIDER_ORDER: AIProvider[] = ["ollama-local", "ollama-cloud", "openai", "9router"];

const PROVIDER_META: Record<AIProvider, {
  label: string;
  description: string;
  modelPlaceholder: string;
  baseUrlPlaceholder: string;
  icon: typeof Bot;
}> = {
  "ollama-local": {
    label: "Ollama Local",
    description: "Run models on this machine with the local Ollama daemon.",
    modelPlaceholder: "llama3.1",
    baseUrlPlaceholder: "http://localhost:11434/v1",
    icon: ServerCog,
  },
  "ollama-cloud": {
    label: "Ollama Cloud",
    description: "Use a remote Ollama-compatible endpoint with your API token.",
    modelPlaceholder: "llama3.1:70b",
    baseUrlPlaceholder: "https://your-ollama-endpoint/v1",
    icon: Cloud,
  },
  openai: {
    label: "OpenAI",
    description: "Direct OpenAI API access for GPT models.",
    modelPlaceholder: "gpt-4o",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    icon: Sparkles,
  },
  "9router": {
    label: "9Router",
    description: "OpenAI-compatible router endpoint for model routing.",
    modelPlaceholder: "openai/gpt-4o",
    baseUrlPlaceholder: "https://router.example.com/v1",
    icon: Bot,
  },
};

function createEmptySettings(): AISettings {
  return {
    activeProvider: "openai",
    providers: {
      "ollama-local": {
        enabled: false,
        model: "llama3.1",
        baseUrl: "http://localhost:11434/v1",
        apiKey: "",
      },
      "ollama-cloud": {
        enabled: false,
        model: "",
        baseUrl: "",
        apiKey: "",
      },
      openai: {
        enabled: false,
        model: "gpt-4o",
        baseUrl: "",
        apiKey: "",
      },
      "9router": {
        enabled: false,
        model: "",
        baseUrl: "",
        apiKey: "",
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
      model: config.model ?? "",
      baseUrl: config.baseUrl ?? "",
      apiKey: config.apiKey ?? "",
    };
  }
  base.activeProvider = settings.activeProvider;
  return base;
}

function providerNeedsApiKey(provider: AIProvider) {
  return provider !== "ollama-local";
}

function providerNeedsBaseUrl(provider: AIProvider) {
  return provider === "ollama-cloud" || provider === "9router";
}

function getProviderStatus(provider: AIProvider, config: AIProviderConfig) {
  if (!config.enabled) return "Not configured";
  if (!config.model.trim()) return "Needs model";
  if (providerNeedsApiKey(provider) && !config.apiKey?.trim()) return "Missing API key";
  if (providerNeedsBaseUrl(provider) && !config.baseUrl?.trim()) return "Needs base URL";
  return "Configured";
}

function isProviderValid(provider: AIProvider, config: AIProviderConfig) {
  return getProviderStatus(provider, config) === "Configured";
}

function getSetActiveBlockedReason(provider: AIProvider, config: AIProviderConfig, isAlreadyActive: boolean) {
  if (isAlreadyActive) return "This provider is already active.";
  if (!config.enabled) return "Enable this provider before making it active.";
  const status = getProviderStatus(provider, config);
  if (status !== "Configured") return `Complete this provider setup first: ${status.toLowerCase()}.`;
  return null;
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function ApiSettingsPage() {
  const { data: savedSettings, isLoading } = useAISettings();
  const saveSettings = useSaveAISettings();
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>("openai");
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
  const activeProviderReady = activeConfig ? isProviderValid(draftSettings.activeProvider, activeConfig) : false;
  const hasUnsavedChanges = JSON.stringify(draftSettings) !== JSON.stringify(savedSnapshot);

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
  const saveBlockedReason = !hasUnsavedChanges
    ? "Make a change to save this page."
    : !activeProviderReady
      ? `Save is disabled until the active provider is complete: ${activeStatus.toLowerCase()}.`
      : null;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="border-b border-border bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.06),_transparent_38%),linear-gradient(135deg,_rgba(226,232,240,0.8),_rgba(255,255,255,0))]">
        <div className="flex flex-wrap items-start gap-3 px-5 py-4">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigateTo("workspace")}
            title="Back to workspace"
          >
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
              Manage provider credentials for the current desktop user. You can keep multiple providers ready and switch the active one without losing drafts.
            </p>
          </div>
          <div className="min-w-[220px] rounded-2xl border border-border/70 bg-background/80 px-4 py-3 shadow-sm">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Active provider
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                {PROVIDER_META[draftSettings.activeProvider].label}
              </Badge>
              <Badge variant="outline">{activeStatus}</Badge>
            </div>
            <p className="mt-2 text-sm text-foreground/80">
              {activeConfig?.model || "No model selected yet"}
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="w-full shrink-0 border-b border-border bg-muted/20 lg:w-[320px] lg:border-r lg:border-b-0">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-1">
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
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      isSelected
                        ? "border-primary/50 bg-background shadow-sm ring-1 ring-primary/15"
                        : "border-border/70 bg-background/75 hover:border-foreground/15 hover:bg-background"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex size-10 items-center justify-center rounded-2xl ${
                          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}>
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{meta.label}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{status}</div>
                        </div>
                      </div>
                      {isActive ? (
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">Active</Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">{meta.description}</p>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-auto px-5 py-5">
              <div className="mx-auto max-w-4xl space-y-5">
                <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <SelectedIcon className="size-5" />
                        </div>
                        <div>
                          <h2 className="text-xl font-semibold">{PROVIDER_META[selectedProvider].label}</h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {PROVIDER_META[selectedProvider].description}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{selectedStatus}</Badge>
                        {selectedProvider === draftSettings.activeProvider ? (
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/10">Currently active</Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant={selectedProvider === draftSettings.activeProvider ? "secondary" : "outline"}
                        onClick={() => setDraftSettings((current) => ({
                          ...current,
                          activeProvider: selectedProvider,
                        }))}
                        disabled={setActiveBlockedReason !== null}
                      >
                        <CheckCircle2 className="size-4" />
                        Set Active
                      </Button>
                      <Button variant="outline" onClick={resetSelectedProvider}>
                        <RotateCcw className="size-4" />
                        Reset Draft
                      </Button>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {setActiveBlockedReason ?? "This provider is ready to become the default for AI chat."}
                  </p>
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="space-y-5">
                    <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                          <div>
                            <div className="text-sm font-medium">Provider enabled</div>
                            <div className="text-xs text-muted-foreground">
                              Enable this provider to keep it available in your saved profile.
                            </div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={selectedConfig.enabled}
                            onClick={() => updateProvider(selectedProvider, { enabled: !selectedConfig.enabled })}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                              selectedConfig.enabled ? "bg-primary" : "bg-muted-foreground/25"
                            }`}
                          >
                            <span
                              className={`inline-block size-5 rounded-full bg-white transition-transform ${
                                selectedConfig.enabled ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </div>

                        <Field
                          label="Model"
                          description="The default model this provider should use for AI chat."
                        >
                          <Input
                            value={selectedConfig.model}
                            onChange={(e) => updateProvider(selectedProvider, { model: e.target.value })}
                            placeholder={PROVIDER_META[selectedProvider].modelPlaceholder}
                            className="h-11 rounded-xl"
                          />
                        </Field>

                        <Field
                          label="Base URL"
                          description={selectedProvider === "openai"
                            ? "Leave blank to use the official OpenAI endpoint. Fill this only when you need an override."
                            : selectedProvider === "ollama-local"
                              ? "Defaults to the standard local Ollama server if you keep it unchanged."
                              : "Required for remote OpenAI-compatible endpoints."
                          }
                        >
                          <Input
                            value={selectedConfig.baseUrl ?? ""}
                            onChange={(e) => updateProvider(selectedProvider, { baseUrl: e.target.value })}
                            placeholder={PROVIDER_META[selectedProvider].baseUrlPlaceholder}
                            className="h-11 rounded-xl"
                          />
                        </Field>

                        {providerNeedsApiKey(selectedProvider) ? (
                          <Field
                            label="API key"
                            description="Stored locally for this desktop user and sent only to the selected provider endpoint."
                          >
                            <Input
                              type="password"
                              value={selectedConfig.apiKey ?? ""}
                              onChange={(e) => updateProvider(selectedProvider, { apiKey: e.target.value })}
                              placeholder="sk-..."
                              className="h-11 rounded-xl"
                            />
                          </Field>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
                      <div className="text-sm font-medium">Provider summary</div>
                      <div className="mt-3 space-y-3 text-sm">
                        <div className="rounded-2xl bg-muted/40 px-3 py-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Selected</div>
                          <div className="mt-1 font-medium">{PROVIDER_META[selectedProvider].label}</div>
                          <div className="mt-1 text-muted-foreground">{selectedStatus}</div>
                        </div>
                        <div className="rounded-2xl bg-muted/40 px-3 py-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Active</div>
                          <div className="mt-1 font-medium">{PROVIDER_META[draftSettings.activeProvider].label}</div>
                          <div className="mt-1 text-muted-foreground">{activeStatus}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
                      <div className="text-sm font-medium">Requirements</div>
                      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                        <li>Model is required for every provider.</li>
                        <li>OpenAI requires an API key.</li>
                        <li>Ollama Cloud and 9Router require both base URL and API key.</li>
                        <li>Ollama Local works without an API key and defaults to the local daemon URL.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border bg-background/95 px-5 py-4 backdrop-blur">
              <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">
                    {hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {saveBlockedReason
                      ? saveBlockedReason
                      : hasUnsavedChanges
                        ? "Draft edits stay on this page until you save them."
                        : "The AI chat panel will use the saved active provider."}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDraftSettings(savedSnapshot);
                      setSelectedProvider(savedSnapshot.activeProvider);
                    }}
                    disabled={!hasUnsavedChanges || saveSettings.isPending}
                  >
                    Discard Changes
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!hasUnsavedChanges || !activeProviderReady || saveSettings.isPending}
                  >
                    {saveSettings.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
