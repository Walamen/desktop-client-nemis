import { render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/government/school-admin/students'),
  useRouter: () => ({ replace: vi.fn() }),
}));

const notificationStore = createStore(() => ({ notifications: [{ id: 'n1', kind: 'info', message: 'x', autoDismissMs: null, createdAt: 0 }] }));
const currentUserStore = createStore(() => ({ user: { status: 'success', data: { fullName: 'Joseph Boakai', roleLabels: ['Institution admin'] } } }));

vi.mock('../../lib/presentation/hooks', () => ({
  useCurrentUserViewModel: () => ({ store: currentUserStore, loadUser: vi.fn() }),
  useNotificationStore: () => ({ store: notificationStore }),
}));

import { Header } from './Header';
import { usePathname } from 'next/navigation';

describe('Header', () => {
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
});
