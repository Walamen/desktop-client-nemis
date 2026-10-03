import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
const connectivityStore = createStore(() => ({ lastSyncAt: null as string | null }));
vi.mock('../../lib/presentation/hooks/shared', () => ({
  useNotificationStore: () => ({ store: notificationStore }),
  useConnectivityStore: () => ({ store: connectivityStore }),
}));
const settingsStore = createStore(() => ({ profile: { status: 'success', data: { id: 'inst-1' } } }));
vi.mock('@/lib/presentation/hooks/school-admin', () => ({
  useSettingsViewModel: () => ({ store: settingsStore }),
}));
vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    logout: vi.fn().mockResolvedValue(undefined),
    listSchoolAdminRecords: vi.fn(),
  },
}));

import { Sidebar } from './Sidebar';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { notifyTransfersChanged } from '@/lib/transfers';

const pushToUs = (id: string) => ({
  id, studentId: `s-${id}`, fromInstitutionId: 'inst-2', toInstitutionId: 'inst-1',
  status: 'PENDING', initiatedBy: 'ORIGIN_SCHOOL', lapsesAt: null,
});
const listMock = vi.mocked(sharedBridge.listSchoolAdminRecords);
const stubRows = (rows: Record<string, unknown>[]) =>
  listMock.mockImplementation(async () => ({ items: rows, total: rows.length }) as never);
const transfersLink = () => screen.getByText('Student Transfers').closest('a') as HTMLElement;

beforeEach(() => {
  listMock.mockReset();
  stubRows([]);
});

describe('Sidebar', () => {
  it('renders school-admin nav groups and items with correct hrefs', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Students').closest('a')).toHaveAttribute('href', '/government/school-admin/students');
    expect(screen.getByText('Attendence Management')).toBeInTheDocument();
    expect(screen.getByText('School Settings')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('marks the active route', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByText('Overview').closest('a')).toHaveClass('bg-slate-800');
  });

  it('renders a second role from its own config, with the static header title', () => {
    render(<Sidebar role={SystemRole.COUNTY_ADMIN} />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Districts').closest('a')).toHaveAttribute('href', '/government/county/districts');
    expect(screen.getByText('Audit Trail').closest('a')).toHaveAttribute('href', '/government/county/audit');
  });

  it('calls sharedBridge.logout() when the Logout button is clicked', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    fireEvent.click(screen.getByText('Logout'));
    expect(sharedBridge.logout).toHaveBeenCalled();
  });

  it('shows the Student Transfers entry for a school admin', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(transfersLink()).toHaveAttribute('href', '/government/school-admin/students/inter-school-transfer');
  });

  it('shows the End-of-Year Outcomes entry for a school admin only', () => {
    const { unmount } = render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByText('End-of-Year Outcomes').closest('a')).toHaveAttribute(
      'href',
      '/government/school-admin/students/promote',
    );
    unmount();
    for (const role of [SystemRole.COUNTY_ADMIN, SystemRole.DEO, SystemRole.MINISTRY_ADMIN, SystemRole.TEACHER]) {
      const view = render(<Sidebar role={role} />);
      expect(screen.queryByText('End-of-Year Outcomes')).toBeNull();
      view.unmount();
    }
  });

  it('badges Student Transfers with the pending-decision count from local rows', async () => {
    stubRows([pushToUs('a'), pushToUs('b'), pushToUs('c')]);
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    await waitFor(() => expect(transfersLink()).toHaveTextContent('3'));
    expect(listMock).toHaveBeenCalledWith({ collection: 'student_transfers', limit: 250 });
  });

  it('hides the badge when nothing awaits a decision', async () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(transfersLink().textContent).toBe('Student Transfers');
  });

  it('re-reads and updates the badge when transfers change', async () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    stubRows([pushToUs('a')]);
    act(() => notifyTransfersChanged());
    await waitFor(() => expect(transfersLink()).toHaveTextContent('1'));
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('makes no transfer read for a non-admin role', async () => {
    render(<Sidebar role={SystemRole.COUNTY_ADMIN} />);
    act(() => notifyTransfersChanged());
    await act(async () => {
      await Promise.resolve();
    });
    expect(listMock).not.toHaveBeenCalled();
  });

  it('renders a role with no dashboardItem without crashing', () => {
    render(<Sidebar role={SystemRole.DEO} />);
    expect(screen.getByText('Schools').closest('a')).toHaveAttribute('href', '/government/deo/schools');
  });
});
