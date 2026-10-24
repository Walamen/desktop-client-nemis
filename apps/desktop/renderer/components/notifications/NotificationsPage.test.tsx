import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/hooks/use-revalidate-on-sync', async () => {
  const { useEffect } = await import('react');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return { useRevalidateOnSync: (fn: () => void, deps: unknown[]) => useEffect(() => { fn(); }, deps) };
});

const headerLoad = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const userStore = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/presentation/hooks/shared', async () => {
  const { createStore: create } = await import('zustand/vanilla');
  userStore.current = create(() => ({ user: { status: 'success', data: { id: 'u1' } } }));
  return {
    useCurrentUserViewModel: () => ({ store: userStore.current, loadCurrentUser: vi.fn() }),
    useHeaderNotificationsViewModel: () => ({ load: headerLoad }),
  };
});

const bridge = vi.hoisted(() => ({
  listSchoolAdminRecords: vi.fn(),
  saveSchoolAdminRecord: vi.fn(async () => ({})),
  getSchoolSummary: vi.fn(async () => ({ name: 'Test School' })),
}));
vi.mock('@/services/nemis-bridge/shared', () => ({ sharedBridge: bridge }));
vi.mock('@/services/nemis-bridge/school-admin', () => ({ schoolAdminBridge: bridge }));

import { NotificationsPage } from './NotificationsPage';

const row = { id: 'n1', recipientId: 'u1', type: 'GENERAL_ALERT', title: 'Hello bell', message: 'm', isRead: false, link: null, createdAt: new Date().toISOString() };

afterEach(() => { headerLoad.mockClear(); });

describe('NotificationsPage', () => {
  it('refreshes the header bell after Mark all read', async () => {
    bridge.listSchoolAdminRecords.mockResolvedValue({ items: [row] });
    render(<NotificationsPage />);
    await waitFor(() => expect(screen.getByText('Hello bell')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Mark all read/ }));
    await waitFor(() => expect(bridge.saveSchoolAdminRecord).toHaveBeenCalled());
    await waitFor(() => expect(headerLoad).toHaveBeenCalled());
  });

  it('refreshes the header bell after marking one read', async () => {
    bridge.listSchoolAdminRecords.mockResolvedValue({ items: [row] });
    render(<NotificationsPage />);
    await waitFor(() => expect(screen.getByText('Hello bell')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Hello bell').closest('div.flex')!.parentElement!.parentElement!.querySelector('button')!);
    await waitFor(() => expect(headerLoad).toHaveBeenCalled());
  });
});
