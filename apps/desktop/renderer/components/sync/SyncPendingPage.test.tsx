import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopSyncStatus, PendingRecord, PendingSummary } from '@nemis-desktop/types';

vi.mock('next/navigation', () => ({ usePathname: () => '/government/teacher/sync-pending' }));
vi.mock('@/hooks/use-revalidate-on-sync', async () => {
  const { useEffect } = await import('react');
  return {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useRevalidateOnSync: (load: () => void | (() => void), deps: readonly unknown[]) => useEffect(load, deps),
  };
});
const bridge = vi.hoisted(() => ({
  listPendingChanges: vi.fn(),
  listPendingRecords: vi.fn(),
  getSyncStatus: vi.fn(),
  runSync: vi.fn(),
}));
vi.mock('@/services/nemis-bridge', () => ({ nemisBridge: bridge }));

import { SyncPendingPage } from './SyncPendingPage';
import { retryCountdown } from './shared';

const ONLINE: DesktopSyncStatus = { pending: 41, inFlight: 0, conflicts: 0, lastSyncAt: null, status: 'idle', isOnline: true };
const SUMMARY: PendingSummary = {
  groups: [{
    groupKey: 'outbox:attendance', source: 'outbox', label: 'Attendance', total: 41,
    byState: { sending: 0, waiting: 38, retrying: 2, held: 1 }, oldestAt: new Date().toISOString(),
  }],
  total: 41, failedCount: 0, partial: false,
};
function record(i: number, over: Partial<PendingRecord> = {}): PendingRecord {
  return {
    id: `q${i}`, entityType: 'attendance', entityId: `att${i}`, operationType: 'create',
    label: `Student ${i} · Grade 5A · 2026-10-14`, state: 'waiting', createdAt: new Date().toISOString(),
    nextAttemptAt: null, retryCount: 0, lastError: null, payload: { record: { id: `att${i}` } }, ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getSyncStatus.mockResolvedValue(ONLINE);
  bridge.listPendingChanges.mockResolvedValue(SUMMARY);
  bridge.runSync.mockResolvedValue(ONLINE);
});

describe('SyncPendingPage', () => {
  it('shows groups with state counts in text', async () => {
    render(<SyncPendingPage />);
    const header = await screen.findByRole('button', { name: /Attendance/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(within(header).getByText('38 waiting')).toBeInTheDocument();
    expect(within(header).getByText('2 retrying')).toBeInTheDocument();
    expect(within(header).getByText('1 held')).toBeInTheDocument();
  });

  it('expands a group, then loads more', async () => {
    bridge.listPendingRecords
      .mockResolvedValueOnce({ records: Array.from({ length: 50 }, (_, i) => record(i)), total: 60 })
      .mockResolvedValueOnce({ records: Array.from({ length: 10 }, (_, i) => record(50 + i)), total: 60 });
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    await user.click(await screen.findByRole('button', { name: /Attendance/ }));
    expect(await screen.findByText('Student 0 · Grade 5A · 2026-10-14')).toBeInTheDocument();
    expect(bridge.listPendingRecords).toHaveBeenCalledWith({ groupKey: 'outbox:attendance', limit: 50, offset: 0 });
    await user.click(screen.getByRole('button', { name: /Load more/ }));
    expect(await screen.findByText('Student 59 · Grade 5A · 2026-10-14')).toBeInTheDocument();
    expect(bridge.listPendingRecords).toHaveBeenLastCalledWith({ groupKey: 'outbox:attendance', limit: 50, offset: 50 });
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('says a group has just synced when it comes back empty', async () => {
    bridge.listPendingRecords.mockResolvedValue({ records: [], total: 0 });
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    await user.click(await screen.findByRole('button', { name: /Attendance/ }));
    expect(await screen.findByText('These changes have just synced.')).toBeInTheDocument();
  });

  it('describes waiting rows as waiting for connection when offline', async () => {
    bridge.getSyncStatus.mockResolvedValue({ ...ONLINE, isOnline: false });
    bridge.listPendingRecords.mockResolvedValue({ records: [record(1)], total: 1 });
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    expect(await screen.findByText(/You're offline/)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Attendance/ }));
    expect(await screen.findByText(/Waiting for connection/)).toBeInTheDocument();
  });

  it('links failures to the conflicts page and warns when partial', async () => {
    bridge.listPendingChanges.mockResolvedValue({ ...SUMMARY, failedCount: 3, partial: true });
    render(<SyncPendingPage />);
    expect(await screen.findByText(/3 items failed to sync/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Review sync conflicts/ })).toHaveAttribute('href', '/government/teacher/sync-conflicts');
    expect(screen.getByText(/couldn't be listed/)).toBeInTheDocument();
  });

  it('shows the empty state when nothing is pending', async () => {
    bridge.listPendingChanges.mockResolvedValue({ groups: [], total: 0, failedCount: 0, partial: false });
    render(<SyncPendingPage />);
    expect(await screen.findByText('Everything is synced')).toBeInTheDocument();
  });

  it('shows an error with retry when loading fails', async () => {
    bridge.listPendingChanges.mockRejectedValueOnce(new Error('locked')).mockResolvedValue(SUMMARY);
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    expect(await screen.findByText(/Could not load pending changes/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Retry$/ }));
    expect(await screen.findByRole('button', { name: /Attendance/ })).toBeInTheDocument();
  });

  it('toggles technical details and the raw payload', async () => {
    bridge.listPendingRecords.mockResolvedValue({
      records: [record(1, { state: 'retrying', retryCount: 2, lastError: 'Server said no', nextAttemptAt: new Date(Date.now() + 4 * 60_000).toISOString() })],
      total: 1,
    });
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    await user.click(await screen.findByRole('button', { name: /Attendance/ }));
    expect(await screen.findByText(/Retrying in 4 min/)).toBeInTheDocument();
    expect(screen.queryByText('Server said no')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Show technical details' }));
    expect(screen.getByText('Server said no')).toBeInTheDocument();
    expect(screen.getByText('outbox:attendance')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /View payload/ }));
    expect(screen.getByText(/"id": "att1"/)).toBeInTheDocument();
  });

  it('syncs now and reloads', async () => {
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    await screen.findByRole('button', { name: /Attendance/ });
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(bridge.runSync).toHaveBeenCalledOnce();
    await waitFor(() => expect(bridge.listPendingChanges).toHaveBeenCalledTimes(2));
  });

  it('opens a group from the keyboard', async () => {
    bridge.listPendingRecords.mockResolvedValue({ records: [record(1)], total: 1 });
    const user = userEvent.setup();
    render(<SyncPendingPage />);
    const header = await screen.findByRole('button', { name: /Attendance/ });
    header.focus();
    await user.keyboard('{Enter}');
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('retryCountdown', () => {
  const now = Date.parse('2026-10-16T12:00:00.000Z');
  it.each([
    ['2026-10-16T11:59:00.000Z', 'now'],
    ['2026-10-16T12:00:30.000Z', 'in under a minute'],
    ['2026-10-16T12:04:00.000Z', 'in 4 min'],
    ['2026-10-16T14:00:00.000Z', 'in 2 h'],
  ])('%s → %s', (iso, expected) => {
    expect(retryCountdown(iso, now)).toBe(expected);
  });
});
