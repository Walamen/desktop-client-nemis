import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { SystemRole, type ProvisioningUser } from '@nemis-desktop/types';
import { SessionUserProvider } from '@/components/shell/SessionUserContext';
import DashboardPage from './page';

vi.mock('@/components/transfers/PriorRecordsToMatchCard', () => ({
  PriorRecordsToMatchCard: () => <div data-testid="prior-records-card" />,
}));

const sessionUser = (role: ProvisioningUser['role'], modules?: ProvisioningUser['modules']) =>
  ({ id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role, scope: 'INSTITUTION', modules }) as unknown as ProvisioningUser;

const quickActionHrefs = () =>
  within(screen.getByText('Quick Actions').parentElement as HTMLElement)
    .queryAllByRole('link')
    .map((a) => a.getAttribute('href') ?? '');

async function renderDashboard(user: ProvisioningUser) {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  render(
    <SessionUserProvider user={user}>
      <PresentationProvider layer={layer}>
        <DashboardPage />
      </PresentationProvider>
    </SessionUserProvider>,
  );
  await waitFor(() => expect(screen.getByText('Total Students')).toBeInTheDocument());
}

beforeEach(() => {
  (window as unknown as { nemis: unknown }).nemis = {
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => null) },
    term: { getCurrent: vi.fn(async () => null) },
    identity: { getCurrentUser: vi.fn(async () => null) },
    device: { getInfo: vi.fn(async () => null) },
    teacher: { getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })) },
  };
});
afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('School Admin dashboard (fresh install)', () => {
  it('shows real zero counts and honest empty states, never sample numbers', async () => {
    await renderDashboard(sessionUser(SystemRole.INSTITUTION_ADMIN));
    expect(screen.getByText('School profile not set up yet').closest('a')).toHaveAttribute('href', '/government/school-admin/school-profile');
    expect(screen.getByText('No academic year configured').closest('a')).toHaveAttribute('href', '/government/school-admin/academic-grading?open=years');
    expect(screen.getByText('No current term configured').closest('a')).toHaveAttribute('href', '/government/school-admin/academic-grading?open=terms');
    expect((await screen.findAllByText('No teachers found.')).length).toBeGreaterThan(0);
    // The old StatCard placeholder badge (exact text "sample") must be gone.
    // RecentActivityFeed's honest "Sample activity — live feed arrives with
    // sync" copy legitimately remains and is out of scope for this assertion.
    expect(screen.queryByText(/^sample$/i)).toBeNull();
  });

  it('shows the prior-records card and every quick action to the school admin', async () => {
    await renderDashboard(sessionUser(SystemRole.INSTITUTION_ADMIN));
    expect(screen.getByTestId('prior-records-card')).toBeInTheDocument();
    const hrefs = quickActionHrefs();
    for (const route of ['students', 'attendance', 'classes', 'academic-grading', 'teachers-staff', 'timetable', 'notifications', 'settings']) {
      expect(hrefs).toContain(`/government/school-admin/${route}`);
    }
  });

  it('prior-records card hidden without STUDENTS', async () => {
    await renderDashboard(sessionUser(SystemRole.INSTITUTION_STAFF, ['FINANCE_PAYMENTS']));
    expect(screen.queryByTestId('prior-records-card')).toBeNull();
  });

  it('prior-records card shown with STUDENTS', async () => {
    await renderDashboard(sessionUser(SystemRole.INSTITUTION_STAFF, ['STUDENTS']));
    expect(screen.getByTestId('prior-records-card')).toBeInTheDocument();
  });

  it("quick actions limited to the user's modules", async () => {
    await renderDashboard(sessionUser(SystemRole.INSTITUTION_STAFF, ['STUDENTS']));
    const hrefs = quickActionHrefs();
    for (const route of ['students', 'notifications', 'settings']) {
      expect(hrefs).toContain(`/government/school-admin/${route}`);
    }
    for (const route of ['attendance', 'classes', 'academic-grading', 'teachers-staff', 'timetable']) {
      expect(hrefs).not.toContain(`/government/school-admin/${route}`);
    }
  });
});
