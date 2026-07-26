import { render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/government/school-admin',
  useRouter: () => ({ replace: vi.fn() }),
}));

// useViewModel calls zustand's real `useStore`, which needs a full StoreApi
// (subscribe/getState/setState) — a bare `{ getState: () => ... }` object is not
// enough and throws "store.subscribe is not a function". Use a real vanilla store,
// same pattern as Header.test.tsx.
const notificationStore = createStore(() => ({ notifications: [] as unknown[] }));
vi.mock('../../lib/presentation/hooks', () => ({
  useNotificationStore: () => ({ store: notificationStore }),
}));
vi.mock('@/services/nemis-bridge', () => ({ nemisBridge: { logout: vi.fn().mockResolvedValue(undefined) } }));

import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('renders school-admin nav groups and items with correct hrefs', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} institutionName="Monrovia Central School" />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Students').closest('a')).toHaveAttribute('href', '/government/school-admin/students');
    expect(screen.getByText('Attendence Management')).toBeInTheDocument();
    expect(screen.getByText('School Settings')).toBeInTheDocument();
    expect(screen.getByText('Monrovia Central School')).toBeInTheDocument();
  });

  it('marks the active route', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} institutionName="X" />);
    expect(screen.getByText('Overview').closest('a')).toHaveClass('bg-slate-800');
  });

  it('renders a second role from its own config, with a static header title', () => {
    render(<Sidebar role={SystemRole.COUNTY_ADMIN} />);
    expect(screen.getByText('NEMIS')).toBeInTheDocument();
    expect(screen.getByText('CEO PANEL')).toBeInTheDocument();
    expect(screen.getByText('Districts').closest('a')).toHaveAttribute('href', '/government/county/districts');
    expect(screen.getByText('Audit Trail').closest('a')).toHaveAttribute('href', '/government/county/audit');
  });
});
