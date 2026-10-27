import { useSyncExternalStore } from 'react';

// Subscribe to a CSS media query without an effect + setState round trip.
// The server snapshot is `false`, so heavy client-only visuals gated on a
// query never render during SSR and appear only once the client confirms.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
