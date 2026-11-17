import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CountyNotification, DeoNotificationsResult } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { DeoNotificationsPage } from './DeoNotificationsPage';

const note = (id: string, type: string, overrides: Partial<CountyNotification> = {}): CountyNotification => ({
  id,
  type,
  title: `Title ${id}`,
  message: `Message ${id}`,
  isRead: false,
  link: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

function result(items: CountyNotification[]): DeoNotificationsResult {
  return {
    districtId: 'd-1',
    district: { id: 'd-1', name: 'Owensgrove' },
    county: { id: 'c-1', name: 'Grand Bassa' },
    items,
    unread: items.filter((n) => !n.isRead).length,
  };
}

const ITEMS = [
  note('n-1', 'NEW_MESSAGE', { title: 'New message from Ann', link: '/messages/conv-1' }),
  note('n-2', 'DEO_ASSIGNED', { isRead: true, link: '/deo/dashboard' }),
  note('n-3', 'ACCOUNT_CREATED', { isRead: true, link: '/school-admin/dashboard' }),
];

function mockNemis(listNotifications: () => Promise<DeoNotificationsResult>) {
  const deo = {
    listNotifications: vi.fn(listNotifications),
    markNotificationRead: vi.fn(async () => true),
    markAllNotificationsRead: vi.fn(async () => 1),
  };
  (window as unknown as { nemis: unknown }).nemis = { deo };
  return deo;
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoNotificationsPage />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('DEO Notifications page', () => {
  it('shows the district, the unread count, type pills with counts and the cards', async () => {
    mockNemis(async () => result(ITEMS));
    renderPage();
    expect(await screen.findByText('New message from Ann')).toBeTruthy();
    expect(screen.getByText('DEO Portal · Owensgrove · Grand Bassa')).toBeTruthy();
    expect(screen.getByText('Unread notifications').previousElementSibling?.textContent).toBe('1');
    expect(screen.getByRole('button', { name: /^All\s*3$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Message\s*1$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Success\s*1$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Info\s*1$/ })).toBeTruthy();
  });

  it('links Open to DEO pages only, and opening marks the notification read', async () => {
    const deo = mockNemis(async () => result(ITEMS));
    renderPage();
    await screen.findByText('New message from Ann');
    const open = screen.getAllByRole('link', { name: 'Open' });
    expect(open.map((a) => a.getAttribute('href'))).toEqual(['/government/deo/messages?conv=conv-1', '/government/deo']);
    fireEvent.click(open[0]!);
    await waitFor(() => expect(deo.markNotificationRead).toHaveBeenCalledWith('n-1'));
  });

  it('marks one read, marks all read, and filters to unread', async () => {
    const deo = mockNemis(async () => result(ITEMS));
    renderPage();
    const card = (await screen.findByText('New message from Ann')).closest('[data-notification]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Mark as Read' }));
    await waitFor(() => expect(deo.markNotificationRead).toHaveBeenCalledWith('n-1'));
    fireEvent.click(screen.getByRole('button', { name: /Mark All as Read/ }));
    await waitFor(() => expect(deo.markAllNotificationsRead).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /^Unread\s*1$/ }));
    expect(screen.queryByText('Title n-2')).toBeNull();
  });

  it('shows 50 at a time with Load more', async () => {
    mockNemis(async () => result(Array.from({ length: 60 }, (_, i) => note(`n-${i}`, 'ACCOUNT_CREATED', { isRead: true }))));
    renderPage();
    await screen.findByText('Title n-0');
    expect(screen.queryByText('Title n-55')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.getByText('Title n-55')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('shows the error with Retry, and the empty state', async () => {
    let fail = true;
    mockNemis(async () => {
      if (fail) throw new Error('database locked');
      return result([]);
    });
    renderPage();
    expect(await screen.findByText('Unable to load notifications.')).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No notifications yet.')).toBeTruthy();
  });
});
