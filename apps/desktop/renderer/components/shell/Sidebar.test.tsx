import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemRole, type ProvisioningUser } from '@nemis-desktop/types';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/government/school-admin'),
  useRouter: () => ({ replace: vi.fn() }),
}));

// useViewModel calls zustand's real `useStore`, which needs a full StoreApi
// (subscribe/getState/setState) — a bare `{ getState: () => ... }` object is not
// enough and throws "store.subscribe is not a function". Use a real vanilla store,
// same pattern as Header.test.tsx.
const connectivityStore = createStore(() => ({ lastSyncAt: null as string | null }));
vi.mock('../../lib/presentation/hooks/shared', () => ({
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
import { SessionUserProvider } from './SessionUserContext';
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
  vi.mocked(sharedBridge.logout).mockResolvedValue(undefined as never);
  listMock.mockReset();
  stubRows([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sidebar', () => {
  it('renders the school-admin groups in order, with correct hrefs', () => {
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    const labels = ['ACADEMIC SETUP', 'STUDENTS & FAMILIES', 'STAFF', 'TEACHING WORKFLOW', 'FINANCE', 'REPORTS & MESSAGES', 'SCHOOL'];
    const rendered = labels.map((l) => screen.getByText(l));
    for (let i = 1; i < rendered.length; i += 1) {
      expect(rendered[i - 1]!.compareDocumentPosition(rendered[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Overview')).toBe('/government/school-admin');
    expect(href('Academic Grading')).toBe('/government/school-admin/academic-grading');
    expect(href('Subjects')).toBe('/government/school-admin/subjects');
    for (const gone of ['Grading System', 'Academic Years', 'Terms', 'Assessment Periods', 'Grade Entry & Results', 'Fees & Billing']) {
      expect(screen.queryByRole('link', { name: gone })).toBeNull();
    }
    expect(href('Parents & Guardians')).toBe('/government/school-admin/parents-guardians');
    expect(href('Attendance')).toBe('/government/school-admin/attendance');
    expect(href('Payment Plan')).toBe('/government/school-admin/financial');
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

  it('has no Promotion & Outcomes entry: promotion lives only inside Close Academic Year', () => {
    for (const role of [SystemRole.INSTITUTION_ADMIN, SystemRole.COUNTY_ADMIN, SystemRole.DEO, SystemRole.MINISTRY_ADMIN, SystemRole.TEACHER]) {
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
    expect(screen.getByRole('link', { name: 'Subjects' })).not.toHaveAttribute('aria-current');
  });

  it('highlights the parent item on a sub-page', () => {
    vi.mocked(usePathname).mockReturnValue('/government/school-admin/students/profile');
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('highlights Academic Grading on the View Grades results page', () => {
    vi.mocked(usePathname).mockReturnValue('/government/school-admin/academic-grading/windows/grades');
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(screen.getByRole('link', { name: 'Academic Grading' })).toHaveAttribute('aria-current', 'page');
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
    expect(screen.getByRole('link', { name: 'Academic Grading' })).toBeVisible();
  });

  it('collapses and re-expands a group, remembering the choice', () => {
    const { unmount } = render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    fireEvent.click(groupToggle('ACADEMIC SETUP'));
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Academic Grading' })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '[]')).toEqual(['ACADEMIC SETUP']);
    unmount();

    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(groupToggle('ACADEMIC SETUP'));
    expect(screen.getByRole('link', { name: 'Academic Grading' })).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '[]')).toEqual([]);
  });

  it('forces open the group holding the current page', () => {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(['ACADEMIC SETUP']));
    vi.mocked(usePathname).mockReturnValue('/government/school-admin/subjects');
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    expect(groupToggle('ACADEMIC SETUP')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Subjects' })).toHaveAttribute('aria-current', 'page');
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
    expect(groupToggle('STUDENTS & FAMILIES')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(groupToggle('STUDENTS & FAMILIES'));
    expect(groupToggle('STUDENTS & FAMILIES')).toHaveAttribute('aria-expanded', 'false');
    expect(warn).toHaveBeenCalled();
  });

  it('shows the transfers badge total on a collapsed STUDENTS & FAMILIES header', async () => {
    stubRows([pushToUs('a'), pushToUs('b')]);
    window.localStorage.setItem(STORE_KEY, JSON.stringify(['STUDENTS & FAMILIES']));
    render(<Sidebar role={SystemRole.INSTITUTION_ADMIN} />);
    await waitFor(() => expect(groupToggle('STUDENTS & FAMILIES')).toHaveAttribute('aria-expanded', 'false'));
    await waitFor(() => expect(groupToggle('STUDENTS & FAMILIES')).toHaveTextContent('2'));
  });

  it('renders plain, non-button group headers for a role without collapsibleGroups', () => {
    render(<Sidebar role={SystemRole.COUNTY_ADMIN} />);
    expect(screen.getByText('PEOPLE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^PEOPLE/ })).toBeNull();
  });
});

const staff = (modules?: ProvisioningUser['modules']) =>
  ({ id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role: SystemRole.INSTITUTION_STAFF, scope: 'INSTITUTION', modules }) as unknown as ProvisioningUser;
const renderStaff = (modules?: ProvisioningUser['modules']) =>
  render(
    <SessionUserProvider user={staff(modules)}>
      <Sidebar role={SystemRole.INSTITUTION_STAFF} />
    </SessionUserProvider>,
  );
const present = (name: string) => screen.queryByRole('link', { name }) !== null;

describe('Sidebar for School Office Staff', () => {
  it('registrar sees Students, Parents & Guardians, Student Transfers, Notifications, Messages, Settings, and no Finance group', () => {
    renderStaff(['STUDENTS']);
    for (const name of ['Overview', 'Students', 'Parents & Guardians', 'Student Transfers', 'Notifications', 'Messages', 'Settings']) {
      expect(present(name)).toBe(true);
    }
    expect(screen.queryByText('FINANCE')).toBeNull();
    expect(present('Record Payment')).toBe(false);
    expect(present('Teachers & Staff')).toBe(false);
    expect(screen.queryByText('ACADEMIC SETUP')).toBeNull();
  });

  it('business manager sees Record Payment and Payment Plan, no Students group', () => {
    renderStaff(['FINANCE_PAYMENTS', 'FINANCE_RULES']);
    expect(present('Record Payment')).toBe(true);
    expect(present('Payment Plan')).toBe(true);
    expect(screen.queryByText('STUDENTS & FAMILIES')).toBeNull();
    expect(present('Students')).toBe(false);
  });

  it('office staff with no modules see Overview, Notifications, Messages and Settings only', () => {
    renderStaff([]);
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Overview', 'Notifications', 'Messages', 'Settings']);
  });

  it('a session saved by an older build (no modules) is treated as no modules', () => {
    renderStaff(undefined);
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Overview', 'Notifications', 'Messages', 'Settings']);
  });

  it('admin sidebar unchanged', () => {
    render(
      <SessionUserProvider user={{ ...staff(), role: SystemRole.INSTITUTION_ADMIN }}>
        <Sidebar role={SystemRole.INSTITUTION_ADMIN} />
      </SessionUserProvider>,
    );
    for (const name of ['Academic Grading', 'Students', 'Teachers & Staff', 'Classes', 'Record Payment', 'Payment Plan', 'Reports', 'Past years', 'Settings', 'Grade Levels', 'Infrastructure & Alerts']) {
      expect(present(name)).toBe(true);
    }
  });

  it('transfer badge reads only with STUDENTS', async () => {
    stubRows([pushToUs('a')]);
    const view = renderStaff(['FINANCE_PAYMENTS', 'FINANCE_RULES']);
    await act(async () => {
      await Promise.resolve();
    });
    expect(listMock).not.toHaveBeenCalled();
    view.unmount();

    renderStaff(['STUDENTS']);
    await waitFor(() => expect(transfersLink()).toHaveTextContent('1'));
    expect(listMock).toHaveBeenCalled();
  });

  it('shares the admin collapsed-groups storage key', () => {
    renderStaff(['STUDENTS']);
    fireEvent.click(groupToggle('STUDENTS & FAMILIES'));
    expect(JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '[]')).toEqual(['STUDENTS & FAMILIES']);
  });
});
