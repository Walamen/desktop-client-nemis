import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DashboardPage from './page';

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
    const layer = createRendererPresentation();
    await layer.bootstrap.run();
    render(
      <PresentationProvider layer={layer}>
        <DashboardPage />
      </PresentationProvider>,
    );
    await waitFor(() => expect(screen.getByText('Total Students')).toBeInTheDocument());
    expect(screen.getByText('School profile not set up yet')).toBeInTheDocument();
    expect(screen.getByText('No academic year configured')).toBeInTheDocument();
    expect(screen.getByText('No current term configured')).toBeInTheDocument();
    expect((await screen.findAllByText('No teachers found.')).length).toBeGreaterThan(0);
    // The old StatCard placeholder badge (exact text "sample") must be gone.
    // RecentActivityFeed's honest "Sample activity — live feed arrives with
    // sync" copy legitimately remains and is out of scope for this assertion.
    expect(screen.queryByText(/^sample$/i)).toBeNull();
  });
});
