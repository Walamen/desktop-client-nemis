import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/government/school-admin/students'),
  useRouter: () => ({ replace }),
}));

vi.mock('@/services/nemis-bridge/shared', () => ({ sharedBridge: { logout: vi.fn() } }));

const notificationStore = createStore(() => ({ notifications: [{ id: 'n1', kind: 'info', message: 'x', autoDismissMs: null, createdAt: 0 }] }));
const baseUser = { fullName: 'Joseph Boakai', firstName: 'Joseph', lastName: 'Boakai', photoUrl: null, roleLabels: ['Principal'] };
const currentUserStore = createStore<{ user: unknown }>(() => ({ user: { status: 'success', data: baseUser } }));
const setUser = (user: unknown) => currentUserStore.setState({ user });

vi.mock('../../lib/presentation/hooks/shared', () => ({
  useCurrentUserViewModel: () => ({ store: currentUserStore, loadUser: vi.fn() }),
  useNotificationStore: () => ({ store: notificationStore }),
}));

import { Header } from './Header';
import { usePathname } from 'next/navigation';
import { sharedBridge } from '@/services/nemis-bridge/shared';

describe('Header', () => {
  beforeEach(() => {
    replace.mockClear();
    vi.mocked(sharedBridge.logout).mockReset();
    setUser({ status: 'success', data: baseUser });
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the resolved title, breadcrumb, user, and notification count', () => {
    render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText(/Home \/ School Admin \/ Students/)).toBeInTheDocument();
    expect(screen.getByText('Joseph Boakai')).toBeInTheDocument();
    expect(screen.getByLabelText(/1 unread notification/i)).toBeInTheDocument();
  });

  it('renders for a role with a non-generic avatarRole (DEO) without throwing', () => {
    vi.mocked(usePathname).mockReturnValueOnce('/government/deo');
    render(<Header role={SystemRole.DEO} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Home \/ DEO/)).toBeInTheDocument();
  });

  it('keeps the name and role on screen while the user reloads', () => {
    setUser({ status: 'refreshing', data: baseUser });
    render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByText('Joseph Boakai')).toBeInTheDocument();
    expect(screen.getByText('Principal')).toBeInTheDocument();
  });

  it('shows the photo when the user has one', () => {
    setUser({ status: 'success', data: { ...baseUser, photoUrl: 'https://res.cloudinary.com/x/jb.jpg' } });
    render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByRole('img', { name: 'Joseph Boakai' })).toHaveAttribute('src', 'https://res.cloudinary.com/x/jb.jpg');
  });

  it('builds initials from first and last name for a one-word name', () => {
    setUser({ status: 'success', data: { ...baseUser, fullName: 'Musu', firstName: 'Musu', lastName: '' } });
    render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('shows a three-word name in full', () => {
    setUser({ status: 'success', data: { ...baseUser, fullName: 'Musu T. Kollie', firstName: 'Musu', lastName: 'Kollie' } });
    render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByText('Musu T. Kollie')).toBeInTheDocument();
  });

  it('shows "Signing out…" and signs out once on a double click', () => {
    vi.mocked(sharedBridge.logout).mockReturnValue(new Promise(() => {}));
    render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
    fireEvent.click(screen.getByText('Joseph Boakai'));
    fireEvent.click(screen.getByText('Sign Out'));
    fireEvent.click(screen.getByText('Signing out…'));
    expect(sharedBridge.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Signing out…')).toBeInTheDocument();
  });

  it('still routes to sign-in when sign-out rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(sharedBridge.logout).mockRejectedValue(new Error('boom'));
    render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
    fireEvent.click(screen.getByText('Joseph Boakai'));
    fireEvent.click(screen.getByText('Sign Out'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(errorSpy).toHaveBeenCalled();
  });

  it('writes nothing to the console', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
    expect(log).not.toHaveBeenCalled();
  });
});
