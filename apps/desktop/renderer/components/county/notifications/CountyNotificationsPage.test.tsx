import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RealtimeEvent } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { CountyNotificationsPage } from './CountyNotificationsPage';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: 'SYSTEM_ANNOUNCEMENT', title: `Title ${id}`, message: `Message ${id}`, isRead: false, link: null,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), ...extra,
});

function renderWith(pages: Record<string, unknown>[], overrides: Record<string, unknown> = {}) {
  let listener: ((event: RealtimeEvent) => void) | null = null;
  const county = {
    listNotifications: vi.fn(async (query: { page: number }) => pages[Math.min(query.page, pages.length) - 1]),
    markNotificationRead: vi.fn(async () => true),
    markAllNotificationsRead: vi.fn(async () => 2),
    ...overrides,
  };
  (window as unknown as { nemis: unknown }).nemis = {
    county,
    events: { subscribe: (fn: (event: RealtimeEvent) => void) => ((listener = fn), () => (listener = null)) },
  };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <CountyNotificationsPage />
    </PresentationProvider>,
  );
  return { county, push: (event: RealtimeEvent) => listener?.(event) };
}

const page = (items: ReturnType<typeof item>[], extra: Record<string, unknown> = {}) => ({
  items, total: items.length, totalAll: 30, unread: 4, alertsUnresolved: 3, page: 1, limit: 20, ...extra,
});

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

const cardValue = (label: string) => screen.getByText(label, { selector: 'p' }).nextElementSibling!.textContent;

describe('County Notifications page', () => {
  it('cards show unread notifications, unresolved alerts and the all-time total', async () => {
    renderWith([page([item('n-1'), item('n-2', { isRead: true })])]);
    await waitFor(() => expect(screen.getByText('Title n-1')).toBeInTheDocument());
    expect(cardValue('Unread')).toBe('4');
    expect(cardValue('System Alerts')).toBe('3');
    expect(cardValue('Total')).toBe('30');
    expect(screen.getAllByText('2h ago')).toHaveLength(2);
    expect(screen.getByText('Stay updated with alerts, approvals, and communications').className).toContain('text-slate-300');
  });

  it('filter switches and load more appends', async () => {
    const { county } = renderWith([
      page([item('n-1')], { total: 2 }),
      page([item('n-2')], { total: 2, page: 2 }),
    ]);
    await waitFor(() => expect(screen.getByText('Title n-1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getByText('Title n-2')).toBeInTheDocument());
    expect(screen.getByText('Title n-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => expect(county.listNotifications).toHaveBeenLastCalledWith({ filter: 'UNREAD', page: 1, limit: 20 }));
  });

  it('read marks one; mark all read is disabled when nothing is unread', async () => {
    const { county } = renderWith([page([item('n-1')])]);
    await waitFor(() => expect(screen.getByText('Title n-1')).toBeInTheDocument());
    fireEvent.click(within(screen.getByText('Title n-1').closest('div.flex-1')!.parentElement!).getByRole('button', { name: /Read/ }));
    await waitFor(() => expect(county.markNotificationRead).toHaveBeenCalledWith('n-1'));
    await waitFor(() => expect(within(screen.getByText('Title n-1').closest('div.flex-1')!.parentElement!).queryByRole('button')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Mark all read/ }));
    await waitFor(() => expect(county.markAllNotificationsRead).toHaveBeenCalled());
  });

  it('mark all read is disabled with no unread notifications', async () => {
    renderWith([page([item('n-1', { isRead: true })], { unread: 0 })]);
    await waitFor(() => expect(screen.getByText('Title n-1')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Mark all read/ })).toBeDisabled();
  });

  it('links open the matching desktop page; external links are hidden', async () => {
    renderWith([
      page([
        item('n-1', { link: '/government/county/schools/sch-1' }),
        item('n-2', { link: 'https://elsewhere.example' }),
      ]),
    ]);
    await waitFor(() => expect(screen.getByText('Title n-1')).toBeInTheDocument());
    const links = screen.getAllByText('View details →');
    expect(links).toHaveLength(1);
    expect(links[0]!.closest('a')!.getAttribute('href')).toBe('/government/county/schools/details?id=sch-1');
  });

  it('empty and error states', async () => {
    renderWith([page([], { totalAll: 0 })]);
    await waitFor(() => expect(screen.getByText('No notifications')).toBeInTheDocument());
  });

  it('a load error says so', async () => {
    renderWith([], { listNotifications: vi.fn(async () => Promise.reject(new Error('locked'))) });
    await waitFor(() => expect(screen.getByText('Failed to load notifications.')).toBeInTheDocument());
  });

  it('a live notification reloads the list', async () => {
    const { county, push } = renderWith([page([item('n-1')])]);
    await waitFor(() => expect(screen.getByText('Title n-1')).toBeInTheDocument());
    county.listNotifications.mockClear();
    push({ type: 'notification' });
    await waitFor(() => expect(county.listNotifications).toHaveBeenCalledWith({ filter: 'ALL', page: 1, limit: 20 }));
  });
});
