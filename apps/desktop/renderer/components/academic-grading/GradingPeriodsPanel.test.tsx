import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

function stubNemis({ year, terms, yearFails = false, termsFail = false }: { year: unknown; terms: unknown[]; yearFails?: boolean; termsFail?: boolean }) {
  const boom = async () => { throw new Error('boom'); };
  (window as unknown as { nemis: unknown }).nemis = {
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(yearFails ? boom : async () => year) },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(termsFail ? boom : async () => terms) },
    identity: { getCurrentUser: vi.fn(async () => null) },
    device: { getInfo: vi.fn(async () => null) },
    teacher: { getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })) },
  };
}

async function renderPanel() {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  return render(
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

  it('shows the load error, not "Create terms", when the current year fails to load', async () => {
    stubNemis({ year: YEAR, terms: [], yearFails: true });
    const { container } = await renderPanel();
    await waitFor(() => expect(container.querySelector('p.text-red-700')).not.toBeNull());
    expect(container.querySelector('p.text-red-700')!.textContent).not.toBe('');
    expect(screen.queryByRole('link', { name: 'Create terms' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Set up an academic year' })).toBeNull();
  });

  it('shows the load error, not "Create terms", when the terms fail to load', async () => {
    stubNemis({ year: YEAR, terms: [], termsFail: true });
    const { container } = await renderPanel();
    await waitFor(() => expect(container.querySelector('p.text-red-700')).not.toBeNull());
    expect(container.querySelector('p.text-red-700')!.textContent).not.toBe('');
    expect(screen.queryByRole('link', { name: 'Create terms' })).toBeNull();
  });

  it('only offers terms that belong to the current year', async () => {
    stubNemis({ year: YEAR, terms: [{ ...TERM, id: 'term-old', name: 'Old Term', academicYearId: 'ay-OTHER' }, TERM] });
    await renderPanel();
    expect(await screen.findByText('Term 1')).toBeInTheDocument();
    expect(screen.queryByText('Old Term')).toBeNull();
  });
});
