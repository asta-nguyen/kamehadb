import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

export function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

export async function listenTauri<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  return listen<T>(event, (event) => {
    handler(event.payload);
  });
}
