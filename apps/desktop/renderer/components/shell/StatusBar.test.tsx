import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const connectivityStore = createStore(() => ({ isOnline: true, syncStatus: 'idle', lastSyncAt: null }));
// Stable across renders, like the real hook: a fresh object each render would
// re-create StatusBar's refresh callback and re-run its polling effect.
const connectivityApi = {
  store: connectivityStore,
  setOnline: vi.fn(),
  markSyncCompleted: vi.fn(),
  setSyncStatus: vi.fn(),
};
const notifications = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }));

vi.mock('../../lib/presentation/hooks/shared', () => ({
  useConnectivityStore: () => connectivityApi,
  useNotificationStore: () => notifications,
  useSyncViewModel: () => ({ store: connectivityStore }),
}));
vi.mock('../../hooks/useAppVersion', () => ({ useAppVersion: () => ({ version: '1.0.0', error: null }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/government/teacher/dashboard' }));
const getSyncStatus = vi.hoisted(() => vi.fn());
const runSync = vi.hoisted(() => vi.fn());
vi.mock('@/services/nemis-bridge', () => ({ nemisBridge: { getSyncStatus, runSync } }));

import { StatusBar, describeManualSync } from './StatusBar';

const status = (pending: number) => ({
  pending, inFlight: 0, conflicts: 0, lastSyncAt: null, status: 'idle' as const, isOnline: true,
});

beforeEach(() => {
  getSyncStatus.mockReset();
  getSyncStatus.mockRejectedValue(new Error('bridge unavailable'));
  runSync.mockReset();
  Object.values(notifications).forEach((fn) => fn.mockReset());
  connectivityStore.setState({ isOnline: true });
});

const FAILED_COPY = 'Sync could not finish. Your changes are still saved on this computer and will be retried.';

describe('StatusBar', () => {
  it('shows online status, database ready, and app version', () => {
    render(<StatusBar />);
    expect(screen.getByText(/Online/i)).toBeInTheDocument();
    expect(screen.getByText(/Local database ready/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument();
    const label = screen.getByText(/Not synced yet/i);
    expect(label).toBeInTheDocument();
    expect(label.closest('button')).toBeNull();
  });

  it('links the pending count to the pending changes page', async () => {
    getSyncStatus.mockResolvedValue(status(47));
    render(<StatusBar />);
    const link = await screen.findByRole('link', { name: '47 pending changes' });
    expect(link).toHaveAttribute('href', '/government/teacher/sync-pending');
  });

  it('formats large pending counts with thousands separators', async () => {
    getSyncStatus.mockResolvedValue(status(1250));
    render(<StatusBar />);
    const link = await screen.findByRole('link', { name: '1,250 pending changes' });
    expect(within(link).getByText('1,250')).toHaveAttribute('data-tone', 'pending');
  });

  it('uses the singular for one pending change', async () => {
    getSyncStatus.mockResolvedValue(status(1));
    render(<StatusBar />);
    expect(await screen.findByRole('link', { name: '1 pending change' })).toBeInTheDocument();
  });

  it('shows the pending count in an amber badge', async () => {
    getSyncStatus.mockResolvedValue(status(47));
    render(<StatusBar />);
    const link = await screen.findByRole('link', { name: '47 pending changes' });
    expect(within(link).getByText('47')).toHaveAttribute('data-tone', 'pending');
    expect(within(link).getByText('pending')).toBeInTheDocument();
  });

  it('shows a neutral badge when nothing is pending', async () => {
    getSyncStatus.mockResolvedValue(status(0));
    render(<StatusBar />);
    const link = await screen.findByRole('link', { name: '0 pending changes' });
    expect(within(link).getByText('0')).toHaveAttribute('data-tone', 'none');
    expect(link).toHaveAttribute('href', '/government/teacher/sync-pending');
  });

  it('shows conflicts in a red badge linking to the conflicts page', async () => {
    getSyncStatus.mockResolvedValue({ ...status(0), conflicts: 2 });
    render(<StatusBar />);
    const link = await screen.findByRole('link', { name: '2 conflicts' });
    expect(link).toHaveAttribute('href', '/government/teacher/sync-conflicts');
    expect(within(link).getByText('2')).toHaveAttribute('data-tone', 'error');
  });

  it('uses the singular for one conflict and a neutral badge for none', async () => {
    getSyncStatus.mockResolvedValue({ ...status(0), conflicts: 1 });
    const { unmount } = render(<StatusBar />);
    expect(await screen.findByRole('link', { name: '1 conflict' })).toBeInTheDocument();
    unmount();

    getSyncStatus.mockResolvedValue(status(0));
    render(<StatusBar />);
    const none = await screen.findByRole('link', { name: '0 conflicts' });
    expect(within(none).getByText('0')).toHaveAttribute('data-tone', 'none');
  });

  it('shows a Sync now button', () => {
    connectivityStore.setState({ isOnline: false });
    render(<StatusBar />);
    const button = screen.getByRole('button', { name: 'Sync now' });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('disables the button while a sync is running', async () => {
    let resolve!: (value: ReturnType<typeof status>) => void;
    runSync.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<StatusBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    const busy = await screen.findByRole('button', { name: 'Syncing…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(busy);
    expect(runSync).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(status(0)); });
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeEnabled();
  });

  it('shows the outcome toast after a manual sync', async () => {
    runSync.mockResolvedValue({ ...status(0), lastSyncAt: '2026-11-02T09:00:00Z' });
    render(<StatusBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(notifications.success).toHaveBeenCalledWith('Everything is up to date.'));
  });

  it('shows an error toast when the sync call fails', async () => {
    runSync.mockRejectedValue(new Error('[NO_WORKSPACE] x'));
    render(<StatusBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(notifications.error).toHaveBeenCalledWith(FAILED_COPY));
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeEnabled();
  });

  it('refreshes the status after a manual sync', async () => {
    runSync.mockResolvedValue(status(3));
    render(<StatusBar />);
    // Let the mount-time poll settle first so it cannot overwrite the sync result.
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByRole('link', { name: '3 pending changes' })).toBeInTheDocument();
  });
});

describe('describeManualSync', () => {
  it.each([
    [{ ...status(0), isOnline: false }, 'warning', "You're offline. Your changes are saved on this computer and will sync when you reconnect."],
    [{ ...status(0), status: 'failed' as const }, 'error', FAILED_COPY],
    [{ ...status(0), status: 'syncing' as const }, 'info', 'Still syncing in the background. This can take a moment on a slow connection.'],
    [status(1), 'info', 'Synced. 1 change is still waiting and will be retried.'],
    [status(1250), 'info', 'Synced. 1,250 changes are still waiting and will be retried.'],
    [status(0), 'success', 'Everything is up to date.'],
  ])('maps %o to %s', (input, kind, message) => {
    expect(describeManualSync(input)).toEqual({ kind, message });
  });
});
