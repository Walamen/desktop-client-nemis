import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopSyncStatus, SyncConflictResult } from '@nemis-desktop/types';

vi.mock('next/navigation', () => ({ usePathname: () => '/government/teacher/sync-conflicts' }));
vi.mock('@/hooks/use-revalidate-on-sync', async () => {
  const { useEffect } = await import('react');
  return {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useRevalidateOnSync: (load: () => void | (() => void), deps: readonly unknown[]) => useEffect(load, deps),
  };
});
const bridge = vi.hoisted(() => ({
  listSyncConflicts: vi.fn(),
  getSyncStatus: vi.fn(),
  resolveSyncConflict: vi.fn(),
  runSync: vi.fn(),
}));
vi.mock('@/services/nemis-bridge', () => ({ nemisBridge: bridge }));

import { SyncConflictsPage } from './SyncConflictsPage';

const ONLINE: DesktopSyncStatus = { pending: 0, inFlight: 0, conflicts: 1, lastSyncAt: null, status: 'idle', isOnline: true };
function conflict(reason: string): SyncConflictResult {
  return {
    id: 'c1', operationId: 'op1', entityType: 'grades', entityId: 'g1', operationType: 'update',
    localPayload: { record: { id: 'g1', score: 80 } }, remotePayload: null, reason,
    status: 'unresolved', source: 'conflict', createdAt: new Date().toISOString(), resolvedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getSyncStatus.mockResolvedValue(ONLINE);
});

describe('SyncConflictsPage academic-year rejections', () => {
  it('shows the closed heading and message, with no keep-local button', async () => {
    bridge.listSyncConflicts.mockResolvedValue([
      conflict('ACADEMIC_YEAR_CLOSED: This academic year is closed. Its records can no longer be changed.'),
    ]);
    render(<SyncConflictsPage />);
    expect(await screen.findByText('Rejected — academic year closed')).toBeInTheDocument();
    expect(screen.getByText('This academic year is closed. Its records can no longer be changed.')).toBeInTheDocument();
    expect(screen.queryByText(/ACADEMIC_YEAR_CLOSED/)).toBeNull();
    expect(screen.queryByRole('button', { name: /keep my offline change/i })).toBeNull();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  it('uses the not-started heading for ACADEMIC_YEAR_NOT_STARTED', async () => {
    bridge.listSyncConflicts.mockResolvedValue([
      conflict('ACADEMIC_YEAR_NOT_STARTED: This academic year has not started yet.'),
    ]);
    render(<SyncConflictsPage />);
    expect(await screen.findByText('Rejected — academic year not started')).toBeInTheDocument();
  });

  it.each([
    ['ACADEMIC_YEAR_ALREADY_ACTIVE', 'Rejected — another academic year is active'],
    ['ACADEMIC_YEAR_NOT_DELETABLE', 'Rejected — academic year cannot be deleted'],
  ])('uses the %s heading', async (token, heading) => {
    bridge.listSyncConflicts.mockResolvedValue([conflict(`${token}: Some message.`)]);
    render(<SyncConflictsPage />);
    expect(await screen.findByText(heading)).toBeInTheDocument();
  });

  it('still offers keep-local for ordinary conflicts', async () => {
    bridge.listSyncConflicts.mockResolvedValue([conflict('Version mismatch')]);
    render(<SyncConflictsPage />);
    expect(await screen.findByRole('button', { name: /keep my offline change/i })).toBeInTheDocument();
  });
});
