import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/government/school-admin'),
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

import { usePathname } from 'next/navigation';
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
  vi.mocked(usePathname).mockReturnValue('/government/school-admin');
  window.localStorage.clear();
  listMock.mockReset();
  stubRows([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sidebar', () => {
  it('renders the school-admin groups in order, with correct hrefs', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    const labels = ['ACADEMIC SETUP', 'STUDENTS', 'STAFF & FAMILIES', 'TEACHING', 'FINANCE', 'REPORTS & MESSAGES', 'SCHOOL'];
    const rendered = labels.map((l) => screen.getByText(l));
    for (let i = 1; i < rendered.length; i += 1) {
      expect(rendered[i - 1]!.compareDocumentPosition(rendered[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Overview')).toBe('/government/school-admin');
    expect(href('Grading System')).toBe('/government/school-admin/academic-grading');
    expect(href('Academic Years')).toBe('/government/school-admin/academic-years');
    expect(href('Terms')).toBe('/government/school-admin/terms');
    expect(href('Assessment Periods')).toBe('/government/school-admin/academic-grading/periods');
    expect(href('Attendance')).toBe('/government/school-admin/attendance');
    expect(href('Grade Entry & Results')).toBe('/government/school-admin/academic-grading/windows');
    expect(href('Grade Levels')).toBe('/government/school-admin/grade-levels');
    expect(href('Infrastructure & Alerts')).toBe('/government/school-admin/infrastructure');
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

  it('shows the Promotion & Outcomes entry for a school admin only', () => {
    const { unmount } = render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByText('Promotion & Outcomes').closest('a')).toHaveAttribute(
      'href',
      '/government/school-admin/students/promote',
    );
    unmount();
    for (const role of [SystemRole.COUNTY_ADMIN, SystemRole.DEO, SystemRole.MINISTRY_ADMIN, SystemRole.TEACHER]) {
      const view = render(<Sidebar role={role} />);
      expect(screen.queryByText('Promotion & Outcomes')).toBeNull();
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

  it('marks the active item with aria-current', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Terms' })).not.toHaveAttribute('aria-current');
  });

  it('highlights the parent item on a sub-page', () => {
    vi.mocked(usePathname).mockReturnValue('/government/school-admin/students/profile');
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('keeps Settings highlighted on the school profile page', () => {
    vi.mocked(usePathname).mockReturnValue('/government/school-admin/school-profile/');
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders a role with no dashboardItem without crashing', () => {
    render(<Sidebar role={SystemRole.DEO} />);
    expect(screen.getByText('Schools').closest('a')).toHaveAttribute('href', '/government/deo/schools');
  });
});

const STORE_KEY = `nemis.sidebar.collapsed.${SystemRole.INSTITUTION_ADMIN}`;
const groupToggle = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });

describe('Sidebar collapsible groups', () => {
  it('starts with every group open', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Academic Years' })).toBeVisible();
  });

  it('collapses and re-expands a group, remembering the choice', () => {
    const { unmount } = render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    fireEvent.click(groupToggle('ACADEMIC SETUP'));
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Academic Years' })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '[]')).toEqual(['ACADEMIC SETUP']);
    unmount();

    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(groupToggle('ACADEMIC SETUP'));
    expect(screen.getByRole('link', { name: 'Academic Years' })).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '[]')).toEqual([]);
  });

  it('forces open the group holding the current page', () => {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(['ACADEMIC SETUP']));
    vi.mocked(usePathname).mockReturnValue('/government/school-admin/terms');
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([['{}'], ['"x"'], ['not json'], ['[1,null]']])('treats stored value %s as all open', (raw) => {
    window.localStorage.setItem(STORE_KEY, raw);
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps working when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('STUDENTS')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(groupToggle('STUDENTS'));
    expect(groupToggle('STUDENTS')).toHaveAttribute('aria-expanded', 'false');
    expect(warn).toHaveBeenCalled();
  });

  it('shows the transfers badge total on a collapsed STUDENTS header', async () => {
    stubRows([pushToUs('a'), pushToUs('b')]);
    window.localStorage.setItem(STORE_KEY, JSON.stringify(['STUDENTS']));
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    await waitFor(() => expect(groupToggle('STUDENTS')).toHaveTextContent('2'));
  });

  it('renders plain, non-button group headers for a role without collapsibleGroups', () => {
    render(<Sidebar role={SystemRole.COUNTY_ADMIN} />);
    expect(screen.getByText('PEOPLE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^PEOPLE/ })).toBeNull();
  });
});
