declare global {
  interface Window {
    readonly __TAURI_INTERNALS__?: unknown;
  }
}

class DesktopOnlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesktopOnlyError';
  }
}

export function isTauriRuntime(): boolean {
  const hasInternals = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;
  // Debug: log whether __TAURI_INTERNALS__ is present so we can see why the
  // PSQL / backup / restore menu items are hidden in non-Tauri contexts.
  console.debug('[isTauriRuntime]', { hasInternals, hasWindow: typeof window !== 'undefined' });
  return hasInternals;
}

export async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new DesktopOnlyError('This action requires the Tauri desktop app');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export async function listenTauri<T>(eventName: string, handler: (payload: T) => void): Promise<() => void> {
  if (!isTauriRuntime()) {
    throw new DesktopOnlyError('This action requires the Tauri desktop app');
  }

  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>(eventName, (event) => {
    handler(event.payload);
  });
}
