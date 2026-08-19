'use client';

import { useEffect, useRef } from 'react';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { useViewModel } from './use-view-model';

/** Runs `load` once for the given `deps` (the normal mount/param-change
 * load), and again every time a sync finishes afterward.
 *
 * Without this, a ViewModel that already has data never refetches — the
 * presentation layer (see app/providers.tsx) is built exactly once per app
 * session via `useMemo(() => createRendererPresentation(), [])`, so a
 * background/manual sync that writes fresh rows into SQLite has no way to
 * reach an already-mounted screen. Only a full window reload rebuilds the
 * store tree from scratch and re-triggers the first load — which is exactly
 * the workaround this hook replaces.
 *
 * The signal is `ConnectivityStore.lastSyncAt`, written by StatusBar's
 * existing 5s sync-status poll every time it observes a new completed sync
 * (see StatusBar.tsx). `load` must internally guard any precondition it
 * needs (e.g. an id not yet resolved) — this hook calls it unconditionally
 * on every qualifying change. Like a plain effect callback, `load` may
 * return a cleanup function (e.g. a `cancelled` flag guarding a stale async
 * response) — it runs before the next call and on unmount, same as
 * `useEffect` would. */
export function useRevalidateOnSync(load: () => void | (() => void), deps: readonly unknown[]): void {
  const connectivity = useConnectivityStore();
  const lastSyncAt = useViewModel(connectivity.store, (s) => s.lastSyncAt);
  const isFirstSyncCheck = useRef(true);

  useEffect(() => {
    return load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    // Skip the sync-triggered reload on mount — the effect above already
    // covers the initial load, and lastSyncAt may already be non-null from
    // an earlier session.
    if (isFirstSyncCheck.current) {
      isFirstSyncCheck.current = false;
      return;
    }
    return load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSyncAt]);
}
