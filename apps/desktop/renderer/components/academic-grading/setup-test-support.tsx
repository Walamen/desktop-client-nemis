import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';

/** Shared helpers for the academic-setup drawer tests. Each test file still
 * declares its own vi.mock('@/services/nemis-bridge/shared', …) — vi.mock is
 * hoisted per file. */

export const yearRow = (over: Record<string, unknown> = {}) => ({
  id: 'y1', institutionId: 'inst-1', code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31',
  isCurrent: true, status: 'ACTIVE', termCount: 2, classCount: 3, ...over,
});

export const termRow = (over: Record<string, unknown> = {}) => ({
  id: 't1', academicYearId: 'y1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-15',
  isCurrent: true, ...over,
});

/** The two years most tests use: an old closed year and the current one. */
export const OLD_YEAR = yearRow({ id: 'y0', code: '2024/2025', isCurrent: false, status: 'CLOSED', termCount: 3 });
export const CURRENT_YEAR = yearRow();

export function stubNemis({
  years = [OLD_YEAR, CURRENT_YEAR],
  terms = [],
  currentYear = null,
  academicYear = {},
  term = {},
}: {
  years?: unknown[];
  terms?: unknown[];
  currentYear?: unknown;
  academicYear?: Record<string, unknown>;
  term?: Record<string, unknown>;
} = {}) {
  (window as unknown as { nemis: unknown }).nemis = {
    dashboard: { getOverview: vi.fn(async () => ({ totalStudents: 0, totalClasses: 0, totalSubjects: 0, attendanceToday: { present: 0, total: 0 }, studentsByGrade: [], recentlyEnrolled: [] })) },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => currentYear), list: vi.fn(async () => years), ...academicYear },
    term: { getCurrent: vi.fn(async () => null), list: vi.fn(async () => terms), ...term },
    identity: { getCurrentUser: vi.fn(async () => null) },
    device: { getInfo: vi.fn(async () => null) },
    teacher: { getDashboard: vi.fn(async () => ({ totalTeachers: 0, bySubject: [], byGrade: [], byEmploymentStatus: [], recentlyAdded: [], totalAssignments: 0, unassignedTeachers: 0 })) },
  };
}

export function clearNemis() {
  delete (window as unknown as { nemis?: unknown }).nemis;
}

export async function renderWithLayer(ui: ReactElement) {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  return render(<PresentationProvider layer={layer}>{ui}</PresentationProvider>);
}

/** The ui Input/Select render a <label> without htmlFor, so getByLabelText
 * cannot resolve them; reach the control through its label's wrapper. */
export function field(label: string): HTMLInputElement & HTMLSelectElement {
  return screen.getByText(label).parentElement!.querySelector('input, select') as HTMLInputElement & HTMLSelectElement;
}
