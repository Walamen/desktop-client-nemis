import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })),
    saveSchoolAdminRecord: vi.fn(),
    deleteSchoolAdminRecord: vi.fn(),
  },
}));

import { sharedBridge } from '@/services/nemis-bridge/shared';
import { ToastHost } from '@/components/shell/ToastHost';
import { GradingPeriodsPanel } from './GradingPeriodsPanel';
import { field } from './setup-test-support';

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

async function renderPanel(props: { onNavigate?: () => void } = {}) {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  return render(
    <PresentationProvider layer={layer}>
      <GradingPeriodsPanel {...props} />
      <ToastHost />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  vi.mocked(sharedBridge.listSchoolAdminRecords).mockImplementation(async () => ({ items: [], total: 0 }));
  vi.mocked(sharedBridge.saveSchoolAdminRecord).mockReset();
  vi.mocked(sharedBridge.deleteSchoolAdminRecord).mockReset();
  vi.restoreAllMocks();
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
    expect(await screen.findByRole('link', { name: 'Create terms' })).toHaveAttribute('href', '/government/school-admin/academic-grading?open=terms');
  });

  it('links to Academic Years when there is no current year at all', async () => {
    stubNemis({ year: null, terms: [] });
    await renderPanel();
    expect(await screen.findByRole('link', { name: 'Set up an academic year' })).toHaveAttribute(
      'href',
      '/government/school-admin/academic-grading?open=years',
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
  it('switches to the Terms drawer instead of navigating when hosted in a drawer', async () => {
    stubNemis({ year: YEAR, terms: [] });
    const onNavigate = vi.fn();
    await renderPanel({ onNavigate });
    fireEvent.click(await screen.findByRole('button', { name: 'Create terms' }));
    expect(onNavigate).toHaveBeenCalledWith('terms');
    expect(screen.queryByRole('link', { name: 'Create terms' })).toBeNull();
  });

  it('switches to the Academic Years drawer when there is no current year', async () => {
    stubNemis({ year: null, terms: [] });
    const onNavigate = vi.fn();
    await renderPanel({ onNavigate });
    fireEvent.click(await screen.findByRole('button', { name: 'Set up an academic year' }));
    expect(onNavigate).toHaveBeenCalledWith('years');
  });
});

describe('GradingPeriodsPanel save feedback', () => {
  const PERIOD = { id: 'gp1', termId: 'term-1', name: 'Period 1', sequence: 1, code: 'P1', startDate: '2025-09-01', endDate: '2025-10-15', weight: 100, periodType: 'REGULAR_PERIOD' };
  const CONFIG = { id: 'c1', periodsPerTerm: 3, maxMarks: 100, passingMarks: 50 };
  const serve = (byCollection: Record<string, unknown[]>) =>
    vi.mocked(sharedBridge.listSchoolAdminRecords).mockImplementation(async ({ collection }: { collection: string }) => ({
      items: (byCollection[collection] ?? []) as never,
      total: 0,
    }));

  it('keeps the period form open and toasts the reason when a save fails', async () => {
    stubNemis({ year: YEAR, terms: [TERM] });
    await renderPanel();
    fireEvent.click(await screen.findByText('Term 1'));
    fireEvent.click(await screen.findByRole('button', { name: /Add Period/ }));
    fireEvent.change(field('Period Name'), { target: { value: 'Midterm' } });
    fireEvent.change(field('Start Date'), { target: { value: '2025-09-01' } });
    fireEvent.change(field('End Date'), { target: { value: '2025-10-15' } });
    vi.mocked(sharedBridge.saveSchoolAdminRecord).mockRejectedValueOnce(new Error('[VALIDATION_FAILED] The provided data failed validation.'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Period' }));
    expect(await screen.findByText("Couldn't save the period. The provided data failed validation.")).toBeInTheDocument();
    expect(field('Period Name')).toHaveValue('Midterm');
  });

  it('toasts a failed delete', async () => {
    serve({ grading_periods: [PERIOD] });
    stubNemis({ year: YEAR, terms: [TERM] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderPanel();
    fireEvent.click(await screen.findByText('Term 1'));
    vi.mocked(sharedBridge.deleteSchoolAdminRecord).mockRejectedValueOnce(new Error('[CONFLICT] Grades exist for this period'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText("Couldn't delete the period. Grades exist for this period")).toBeInTheDocument();
  });

  it('reports how many periods auto setup created when it stops partway, and reloads', async () => {
    serve({ institution_grading_configs: [CONFIG] });
    stubNemis({ year: YEAR, terms: [TERM] });
    await renderPanel();
    fireEvent.click(await screen.findByText('Term 1'));
    vi.mocked(sharedBridge.saveSchoolAdminRecord)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('[CONFLICT] Code P2 already exists'));
    const periodListsBefore = vi.mocked(sharedBridge.listSchoolAdminRecords).mock.calls.filter(([r]) => r.collection === 'grading_periods').length;
    const autoSetupButton = await screen.findByRole('button', { name: /Auto Setup All Periods/ });
    await waitFor(() => expect(autoSetupButton).toBeEnabled()); // enabled once the grading config has loaded
    fireEvent.click(autoSetupButton);
    expect(
      await screen.findByText("Only 1 of 3 assessment periods was created. Add the rest with Add Period, or delete them and run Auto Setup again. Code P2 already exists"),
    ).toBeInTheDocument();
    expect(sharedBridge.saveSchoolAdminRecord).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(
        vi.mocked(sharedBridge.listSchoolAdminRecords).mock.calls.filter(([r]) => r.collection === 'grading_periods').length,
      ).toBeGreaterThan(periodListsBefore),
    );
  });

  it('toasts when auto setup creates every period', async () => {
    serve({ institution_grading_configs: [CONFIG] });
    stubNemis({ year: YEAR, terms: [TERM] });
    await renderPanel();
    fireEvent.click(await screen.findByText('Term 1'));
    vi.mocked(sharedBridge.saveSchoolAdminRecord).mockResolvedValue({} as never);
    const autoSetupButton = await screen.findByRole('button', { name: /Auto Setup All Periods/ });
    await waitFor(() => expect(autoSetupButton).toBeEnabled()); // enabled once the grading config has loaded
    fireEvent.click(autoSetupButton);
    expect(await screen.findByText('Assessment periods created.')).toBeInTheDocument();
    expect(sharedBridge.saveSchoolAdminRecord).toHaveBeenCalledTimes(3);
  });
});
