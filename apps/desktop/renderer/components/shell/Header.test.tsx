import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/government/school-admin/students'),
  useRouter: () => ({ replace }),
}));

vi.mock('@/services/nemis-bridge/shared', () => ({ sharedBridge: { logout: vi.fn(), getAcademicContext: vi.fn() } }));
vi.mock('@/hooks/use-revalidate-on-sync', () => ({
  useRevalidateOnSync: (load: () => void | (() => void), deps: unknown[]) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => load(), deps);
  },
}));

vi.mock('./NotificationBell', () => ({ NotificationBell: () => <span aria-label="2 unread notifications" /> }));
const baseUser = { fullName: 'Joseph Boakai', firstName: 'Joseph', lastName: 'Boakai', photoUrl: null, roleLabels: ['Principal'] };
const currentUserStore = createStore<{ user: unknown }>(() => ({ user: { status: 'success', data: baseUser } }));
const setUser = (user: unknown) => currentUserStore.setState({ user });

vi.mock('../../lib/presentation/hooks/shared', () => ({
  useCurrentUserViewModel: () => ({ store: currentUserStore, loadUser: vi.fn() }),
}));

import { Header } from './Header';
import { usePathname } from 'next/navigation';
import { sharedBridge } from '@/services/nemis-bridge/shared';

describe('Header', () => {
  beforeEach(() => {
    replace.mockClear();
    vi.mocked(sharedBridge.logout).mockReset();
    vi.mocked(sharedBridge.getAcademicContext).mockReset();
    vi.mocked(sharedBridge.getAcademicContext).mockResolvedValue({ year: null, term: null, period: null });
    setUser({ status: 'success', data: baseUser });
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the resolved title, breadcrumb, user', () => {
    render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText(/Home \/ School Admin \/ Students/)).toBeInTheDocument();
    expect(screen.getByText('Joseph Boakai')).toBeInTheDocument();
  });

  it('shows no bell for DEO or Ministry', () => {
    for (const role of [SystemRole.DEO, SystemRole.MINISTRY_ADMIN]) {
      const { unmount } = render(<Header role={role} />);
      expect(screen.queryByLabelText(/unread notifications/)).toBeNull();
      unmount();
    }
  });

  it('shows the bell for County, School Admin and Teacher', () => {
    for (const role of [SystemRole.COUNTY_ADMIN, SystemRole.INSTITUTION_ADMIN, SystemRole.TEACHER]) {
      const { unmount } = render(<Header role={role} />);
      expect(screen.getByLabelText(/unread notifications/)).toBeInTheDocument();
      unmount();
    }
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

  describe('academic year label', () => {
    it('shows year, term and period for a school admin', async () => {
      vi.mocked(sharedBridge.getAcademicContext).mockResolvedValue({
        year: { id: 'y', code: '2026/2027', status: 'ACTIVE' },
        term: { id: 't', name: 'First Semester' },
        period: { id: 'p', name: 'Period 2' },
      });
      render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
      expect(await screen.findByText('2026/2027 · First Semester · Period 2')).toBeInTheDocument();
    });

    it('omits the parts that are missing, and shows it for a teacher', async () => {
      vi.mocked(sharedBridge.getAcademicContext).mockResolvedValue({
        year: { id: 'y', code: '2026/2027', status: 'ACTIVE' },
        term: null,
        period: null,
      });
      render(<Header role={SystemRole.TEACHER} />);
      expect(await screen.findByText('2026/2027')).toBeInTheDocument();
    });

    it('says so when there is no active academic year', async () => {
      render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
      expect(await screen.findByText('No active academic year')).toBeInTheDocument();
    });

    it('office staff see the academic-year label', async () => {
      vi.mocked(sharedBridge.getAcademicContext).mockResolvedValue({
        year: { id: 'y', code: '2026/2027', status: 'ACTIVE' },
        term: null,
        period: null,
      });
      render(<Header role={SystemRole.INSTITUTION_STAFF} />);
      expect(await screen.findByText('2026/2027')).toBeInTheDocument();
    });

    it('is not rendered, nor fetched, for DEO, county and ministry', () => {
      for (const role of [SystemRole.DEO, SystemRole.COUNTY_ADMIN, SystemRole.MINISTRY_ADMIN]) {
        const { unmount } = render(<Header role={role} />);
        expect(screen.queryByTestId('academic-year-label')).toBeNull();
        unmount();
      }
      expect(sharedBridge.getAcademicContext).not.toHaveBeenCalled();
    });
  });

  it('writes nothing to the console', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    render(<Header role={SystemRole.INSTITUTION_ADMIN} />);
    expect(log).not.toHaveBeenCalled();
  });
});
