import { act, render } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';

const connectivityStore = createStore(() => ({ isOnline: true, syncStatus: 'idle' as const, lastSyncAt: null as string | null }));

vi.mock('@/lib/presentation/hooks/shared', () => ({
  useConnectivityStore: () => ({ store: connectivityStore }),
}));

import { useRevalidateOnSync } from './use-revalidate-on-sync';

describe('useRevalidateOnSync', () => {
  it('loads once on mount and does not reload just because lastSyncAt was already set from an earlier session', () => {
    connectivityStore.setState({ lastSyncAt: '2026-01-01T00:00:00.000Z' });
    const load = vi.fn();
    function Probe() {
      useRevalidateOnSync(load, []);
      return null;
    }
    render(<Probe />);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads when a sync completes after mount', () => {
    connectivityStore.setState({ lastSyncAt: null });
    const load = vi.fn();
    function Probe() {
      useRevalidateOnSync(load, []);
      return null;
    }
    render(<Probe />);
    expect(load).toHaveBeenCalledTimes(1);

    act(() => connectivityStore.setState({ lastSyncAt: '2026-08-14T12:00:00.000Z' }));
    expect(load).toHaveBeenCalledTimes(2);

    act(() => connectivityStore.setState({ lastSyncAt: '2026-08-14T12:05:00.000Z' }));
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('runs each call\'s returned cleanup before its own next reload, and all pending cleanups on unmount', () => {
    // The mount/deps load and the sync-triggered reload are two independent
    // effects (different triggers, different lifecycles), so a call's
    // cleanup guards its *own* next call or unmount — not the other
    // trigger's. A sync tick doesn't cancel a still-in-flight mount fetch;
    // it just starts its own, independently-cancelable one.
    connectivityStore.setState({ lastSyncAt: null });
    const cleanups: Array<ReturnType<typeof vi.fn>> = [];
    const load = vi.fn(() => {
      const cleanup = vi.fn();
      cleanups.push(cleanup);
      return cleanup;
    });
    function Probe() {
      useRevalidateOnSync(load, []);
      return null;
    }
    const { unmount } = render(<Probe />);
    expect(load).toHaveBeenCalledTimes(1);
    expect(cleanups[0]).not.toHaveBeenCalled();

    act(() => connectivityStore.setState({ lastSyncAt: '2026-08-14T12:00:00.000Z' }));
    expect(load).toHaveBeenCalledTimes(2);
    // The mount call's cleanup is untouched by the sync tick — only a second
    // sync tick (or unmount) would retire the first sync call's cleanup.
    expect(cleanups[0]).not.toHaveBeenCalled();
    expect(cleanups[1]).not.toHaveBeenCalled();

    act(() => connectivityStore.setState({ lastSyncAt: '2026-08-14T12:05:00.000Z' }));
    expect(load).toHaveBeenCalledTimes(3);
    expect(cleanups[1]).toHaveBeenCalledTimes(1);

    unmount();
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    expect(cleanups[2]).toHaveBeenCalledTimes(1);
  });

  it('reloads when the passed deps change, same as a plain useEffect', () => {
    connectivityStore.setState({ lastSyncAt: null });
    const load = vi.fn();
    function Probe({ id }: { id: string }) {
      useRevalidateOnSync(load, [id]);
      return null;
    }
    const { rerender } = render(<Probe id="a" />);
    expect(load).toHaveBeenCalledTimes(1);
    rerender(<Probe id="b" />);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
