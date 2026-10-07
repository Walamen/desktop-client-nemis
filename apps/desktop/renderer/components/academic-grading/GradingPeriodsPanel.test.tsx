import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })),
    saveSchoolAdminRecord: vi.fn(),
    deleteSchoolAdminRecord: vi.fn(),
  },
}));

import { GradingPeriodsPanel } from './GradingPeriodsPanel';

const YEAR = { id: 'ay-1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-06-30', isCurrent: true };
const TERM = { id: 'term-1', academicYearId: 'ay-1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-15', isCurrent: true };

function stubNemis({ year, terms }: { year: unknown; terms: unknown[] }) {
  (window as unknown as { nemis: unknown }).nemis = {
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => year) },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => terms) },
    identity: { getCurrentUser: vi.fn(async () => null) },
    device: { getInfo: vi.fn(async () => null) },
    teacher: { getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })) },
  };
}

async function renderPanel() {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  render(
    <PresentationProvider layer={layer}>
      <GradingPeriodsPanel />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('GradingPeriodsPanel', () => {
  it('lists the current year\'s terms to choose from', async () => {
    stubNemis({ year: YEAR, terms: [TERM] });
    await renderPanel();
    expect(await screen.findByText('Term 1')).toBeInTheDocument();
  });

  it('links to Terms when the current year has none', async () => {
    stubNemis({ year: YEAR, terms: [] });
    await renderPanel();
    expect(await screen.findByRole('link', { name: 'Create terms' })).toHaveAttribute('href', '/government/school-admin/terms');
  });

  it('links to Academic Years when there is no current year at all', async () => {
    stubNemis({ year: null, terms: [] });
    await renderPanel();
    expect(await screen.findByRole('link', { name: 'Set up an academic year' })).toHaveAttribute(
      'href',
      '/government/school-admin/academic-years',
    );
    expect(screen.queryByText(/No terms configured/)).toBeNull();
  });
});
