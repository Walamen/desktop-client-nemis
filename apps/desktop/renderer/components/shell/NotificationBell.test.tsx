import { act, fireEvent, render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/government/school-admin',
  useRouter: () => ({ push }),
}));
vi.mock('@/hooks/use-revalidate-on-sync', () => ({ useRevalidateOnSync: vi.fn() }));
vi.mock('@/hooks/use-realtime', () => ({ useRealtime: vi.fn() }));

type Item = { id: string; type: string; title: string; message: string; link: string | null; createdAt: string };
const load = vi.fn(() => Promise.resolve());
const reset = vi.fn(() => store.setState({ status: 'idle', unread: 0, recent: [] }));
const userStore = createStore<{ user: { status: string; data?: { id: string } } }>(() => ({ user: { status: 'success', data: { id: 'u1' } } }));
const store = createStore<{ status: string; unread: number; recent: Item[] }>(() => ({ status: 'ready', unread: 0, recent: [] }));
vi.mock('../../lib/presentation/hooks/shared', () => ({
  useHeaderNotificationsViewModel: () => ({ store, load, reset }),
  useCurrentUserViewModel: () => ({ store: userStore }),
}));

import { NotificationBell } from './NotificationBell';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useRealtime } from '@/hooks/use-realtime';

const BASE = '/government/school-admin';
const item = (over: Partial<Item> = {}): Item => ({
  id: 'n1', type: 'GENERAL_ALERT', title: 'Exam week', message: 'Starts Monday', link: null, createdAt: new Date().toISOString(), ...over,
});
const setState = (unread: number, recent: Item[] = []) => store.setState({ status: 'ready', unread, recent });

describe('NotificationBell', () => {
  beforeEach(() => {
    push.mockClear();
    load.mockClear();
    reset.mockClear();
    userStore.setState({ user: { status: 'success', data: { id: 'u1' } } });
    setState(0);
  });

  it('shows the unread count', () => {
    setState(3);
    render(<NotificationBell basePath={BASE} />);
    expect(screen.getByLabelText('3 unread notifications')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('caps at 99+', () => {
    setState(150);
    render(<NotificationBell basePath={BASE} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('shows no badge at zero', () => {
    render(<NotificationBell basePath={BASE} />);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('lists recent notifications with their type tag and time', () => {
    setState(3, [item()]);
    render(<NotificationBell basePath={BASE} />);
    fireEvent.click(screen.getByLabelText('3 unread notifications'));
    expect(screen.getByText('Exam week')).toBeInTheDocument();
    expect(screen.getByText('Alert')).toBeInTheDocument();
    expect(screen.getByText('3 new')).toBeInTheDocument();
    expect(screen.getByText('Just now')).toBeInTheDocument();
  });

  it('says when there is nothing new', () => {
    render(<NotificationBell basePath={BASE} />);
    fireEvent.click(screen.getByLabelText('0 unread notifications'));
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  it('says so when the first load failed instead of claiming an empty inbox', () => {
    store.setState({ status: 'error', unread: 0, recent: [] });
    render(<NotificationBell basePath={BASE} />);
    fireEvent.click(screen.getByLabelText('0 unread notifications'));
    expect(screen.getByText("Couldn't load notifications")).toBeInTheDocument();
    expect(screen.queryByText('No notifications')).toBeNull();
  });

  it('drops the previous user notifications when a different user signs in', () => {
    setState(2, [item({ title: 'Old user note' })]);
    render(<NotificationBell basePath={BASE} />);
    fireEvent.click(screen.getByLabelText('2 unread notifications'));
    expect(screen.getByText('Old user note')).toBeInTheDocument();
    load.mockClear();
    act(() => userStore.setState({ user: { status: 'success', data: { id: 'u2' } } }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Old user note')).toBeNull();
    expect(screen.getByLabelText('0 unread notifications')).toBeInTheDocument();
  });

  it('does not reset on first mount', () => {
    render(<NotificationBell basePath={BASE} />);
    expect(reset).not.toHaveBeenCalled();
  });

  it('goes to the notification link inside the portal', () => {
    setState(1, [item({ link: `${BASE}/staff` })]);
    render(<NotificationBell basePath={BASE} />);
    fireEvent.click(screen.getByLabelText('1 unread notifications'));
    fireEvent.click(screen.getByText('Exam week'));
    expect(push).toHaveBeenCalledWith(`${BASE}/teachers-staff`);
    expect(screen.queryByText('View all notifications')).toBeNull();
  });

  it('an item without a usable link opens the Notifications page', () => {
    setState(1, [item({ link: null })]);
    render(<NotificationBell basePath={BASE} />);
    fireEvent.click(screen.getByLabelText('1 unread notifications'));
    fireEvent.click(screen.getByText('Exam week'));
    expect(push).toHaveBeenCalledWith(`${BASE}/notifications`);
  });

  it('View all notifications opens the Notifications page', () => {
    render(<NotificationBell basePath={BASE} />);
    fireEvent.click(screen.getByLabelText('0 unread notifications'));
    fireEvent.click(screen.getByText('View all notifications'));
    expect(push).toHaveBeenCalledWith(`${BASE}/notifications`);
    expect(screen.queryByText('View all notifications')).toBeNull();
  });

  it('reloads when opened', () => {
    render(<NotificationBell basePath={BASE} />);
    const before = load.mock.calls.length;
    fireEvent.click(screen.getByLabelText('0 unread notifications'));
    expect(load.mock.calls.length).toBe(before + 1);
  });

  it('reloads on sync/path change and on a realtime notification event', () => {
    render(<NotificationBell basePath={BASE} />);
    const revalidate = vi.mocked(useRevalidateOnSync).mock.calls.at(-1)!;
    expect(revalidate[1]).toEqual([BASE]);
    load.mockClear();
    (revalidate[0] as () => void)();
    expect(load).toHaveBeenCalledTimes(1);
    const onEvent = vi.mocked(useRealtime).mock.calls.at(-1)![0];
    onEvent({ type: 'notification' } as never);
    expect(load).toHaveBeenCalledTimes(2);
    onEvent({ type: 'other' } as never);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
