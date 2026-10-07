import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: { listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })) },
}));

import { AcademicYearsPage, TermsPage, initialYearId } from './AcademicFoundationPages';

const year = (over: Record<string, unknown>) => ({
  id: 'y1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 2, classCount: 3, ...over,
});
const CURRENT = year({});
const OLD = year({ id: 'y0', code: '2024/2025', isCurrent: false, status: 'CLOSED', termCount: 3 });

function stubNemis() {
  (window as unknown as { nemis: unknown }).nemis = {
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => [OLD, CURRENT]) },
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

describe('initialYearId', () => {
  const years = [{ id: 'y0', isCurrent: false }, { id: 'y1', isCurrent: true }];
  it('uses the requested year when it exists', () => expect(initialYearId(years, 'y0')).toBe('y0'));
  it('falls back to the current year for an unknown request', () => expect(initialYearId(years, 'gone')).toBe('y1'));
  it('falls back to the current year when nothing is requested', () => expect(initialYearId(years, '')).toBe('y1'));
  it('falls back to the first year when none is current', () =>
    expect(initialYearId([{ id: 'a', isCurrent: false }], '')).toBe('a'));
  it('returns empty for no years', () => expect(initialYearId([], 'y0')).toBe(''));
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
});
