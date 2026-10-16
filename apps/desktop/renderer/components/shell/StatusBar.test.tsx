import { render, screen, within } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const connectivityStore = createStore(() => ({ isOnline: true, syncStatus: 'idle', lastSyncAt: null }));

vi.mock('../../lib/presentation/hooks/shared', () => ({
  useConnectivityStore: () => ({
    store: connectivityStore,
    setOnline: vi.fn(),
    markSyncCompleted: vi.fn(),
    setSyncStatus: vi.fn(),
  }),
  useSyncViewModel: () => ({ store: connectivityStore }),
}));
vi.mock('../../hooks/useAppVersion', () => ({ useAppVersion: () => ({ version: '1.0.0', error: null }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/government/teacher/dashboard' }));
const getSyncStatus = vi.hoisted(() => vi.fn());
vi.mock('@/services/nemis-bridge', () => ({ nemisBridge: { getSyncStatus, runSync: vi.fn() } }));

import { StatusBar } from './StatusBar';

const status = (pending: number) => ({
  pending, inFlight: 0, conflicts: 0, lastSyncAt: null, status: 'idle' as const, isOnline: true,
});

beforeEach(() => {
  getSyncStatus.mockReset();
  getSyncStatus.mockRejectedValue(new Error('bridge unavailable'));
});

describe('StatusBar', () => {
  it('shows online status, database ready, and app version', () => {
    render(<StatusBar />);
    expect(screen.getByText(/Online/i)).toBeInTheDocument();
    expect(screen.getByText(/Local database ready/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Not synced yet/i)).toBeInTheDocument();
  });

  it('links the pending count to the pending changes page', async () => {
    getSyncStatus.mockResolvedValue(status(47));
    render(<StatusBar />);
    const link = await screen.findByRole('link', { name: '47 pending changes' });
    expect(link).toHaveAttribute('href', '/government/teacher/sync-pending');
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
});
