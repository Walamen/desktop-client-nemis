import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: { listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })) },
}));

import { AcademicYearsPage, TermsPage } from './AcademicFoundationPages';

const year = (over: Record<string, unknown>) => ({
  id: 'y1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 2, classCount: 3, ...over,
});
const CURRENT = year({});
const OLD = year({ id: 'y0', code: '2024/2025', isCurrent: false, status: 'CLOSED', termCount: 3 });

function stubNemis(years: unknown[] = [OLD, CURRENT]) {
  (window as unknown as { nemis: unknown }).nemis = {
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => years) },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => []) },
    identity: { getCurrentUser: vi.fn(async () => null) },
    device: { getInfo: vi.fn(async () => null) },
    teacher: { getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })) },
  };
}

async function renderWithLayer(ui: ReactElement) {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  render(<PresentationProvider layer={layer}>{ui}</PresentationProvider>);
}

// The ui Select renders a <label> without htmlFor, so getByLabelText cannot resolve it; reach the select via its label.
const yearSelect = () => screen.getByText('Academic year').parentElement!.querySelector('select')!;

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  window.history.replaceState({}, '', '/');
});

describe('AcademicYearsPage', () => {
  it('links each year\'s term count to Terms for that year', async () => {
    stubNemis();
    await renderWithLayer(<AcademicYearsPage />);
    expect(await screen.findByRole('link', { name: '3 terms in 2024/2025' })).toHaveAttribute(
      'href',
      '/government/school-admin/terms?yearId=y0',
    );
  });

  it('uses the singular for a year with one term', async () => {
    stubNemis([year({ termCount: 1 })]);
    await renderWithLayer(<AcademicYearsPage />);
    expect(await screen.findByRole('link', { name: '1 term in 2025/2026' })).toBeInTheDocument();
  });
});

describe('TermsPage', () => {
  it('opens on the year named in ?yearId', async () => {
    stubNemis();
    window.history.replaceState({}, '', '/?yearId=y0');
    await renderWithLayer(<TermsPage />);
    await waitFor(() => expect(yearSelect()).toHaveValue('y0'));
  });

  it('opens on the current year when ?yearId is stale', async () => {
    stubNemis();
    window.history.replaceState({}, '', '/?yearId=deleted-year');
    await renderWithLayer(<TermsPage />);
    await waitFor(() => expect(yearSelect()).toHaveValue('y1'));
  });

  it('sends the admin to Academic Years when none exist yet', async () => {
    stubNemis([]);
    await renderWithLayer(<TermsPage />);
    expect(await screen.findByText('No academic year yet.')).toBeInTheDocument();
    expect(screen.getByText('Create academic year').closest('a')).toHaveAttribute(
      'href',
      '/government/school-admin/academic-years',
    );
  });
});
