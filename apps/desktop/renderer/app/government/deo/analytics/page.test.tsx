import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SystemRole } from '@nemis-desktop/types';
import type { DeoDashboardResult, DeoSchoolRow } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { sidebarConfigs } from '@/components/shell/sidebarConfig';
import DeoAnalytics from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function school(
  id: string,
  name: string,
  performanceStatus: string,
  attendanceRate: number | null,
  teachers = 2,
): DeoSchoolRow {
  return {
    id,
    name,
    code: id,
    levels: ['PRIMARY'],
    students: 100,
    teachers,
    attendanceRate,
    performanceStatus,
    complianceStatus: 'Compliant',
    feeCollectionRate: null,
    principalName: null,
  } as DeoSchoolRow;
}

function dashboard(
  opts: { schools?: DeoSchoolRow[]; rates?: number[]; alerts?: number } = {},
): DeoDashboardResult {
  return {
    districtId: 'd-1',
    district: { id: 'd-1', name: 'Kakata' },
    county: { id: 'c-1', name: 'Margibi' },
    stats: { totalSchools: 3, totalStudents: 300, totalTeachers: 6, feeCompliance: 0 },
    alerts: [],
    alertSummary: { total: opts.alerts ?? 0, critical: 0, high: 0, medium: 0, low: 0 },
    schools: opts.schools ?? [
      school('a', 'Alpha', 'Good', 90),
      school('b', 'Beta', 'Critical', 40),
      school('c', 'Gamma', 'No Data', null),
    ],
    chartData: {
      enrollmentTrend: [
        { period: 'Jan', enrollment: 100 },
        { period: 'Feb', enrollment: 110 },
      ],
      attendanceTrend: (opts.rates ?? [70, 75]).map((rate, i) => ({ period: `M${i}`, rate })),
      genderDistribution: { male: 50, female: 50 },
    },
  } as DeoDashboardResult;
}

function mockNemis(result: DeoDashboardResult | Error) {
  const getDashboard = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  (window as unknown as { nemis: unknown }).nemis = {
    deo: { getDashboard, resolveAlert: vi.fn(async () => true) },
  };
  return getDashboard;
}

function renderPage() {
  return render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoAnalytics />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('DEO Analytics page', () => {
  it('shows the district and county and has no dropdowns', async () => {
    mockNemis(dashboard());
    const { container } = renderPage();
    expect(await screen.findByText('Kakata · Margibi')).toBeInTheDocument();
    expect(container.querySelector('select')).toBeNull();
  });

  it('counts a No Data school apart from Warning + Critical', async () => {
    mockNemis(dashboard());
    renderPage();
    const card = (await screen.findByText('Warning + Critical')).closest('div.bg-white') as HTMLElement;
    expect(within(card).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('No data: 1')).toBeInTheDocument();
    expect(screen.getByText(/1 school is in critical status/)).toBeInTheDocument();
  });

  it('says a school has no attendance recorded', async () => {
    mockNemis(dashboard());
    renderPage();
    expect(
      await screen.findByText('1 school has no attendance recorded in the last 30 days.'),
    ).toBeInTheDocument();
    expect(screen.getByText('1 school without attendance data')).toBeInTheDocument();
  });

  it('drops the pending-review and not-submitted wording', async () => {
    mockNemis(dashboard());
    renderPage();
    await screen.findByText('Performance Insights');
    expect(screen.queryByText(/pending review/)).toBeNull();
    expect(screen.queryByText(/not submitted data/)).toBeNull();
  });

  it('uses the alert summary total for open alerts', async () => {
    mockNemis(dashboard({ alerts: 4 }));
    renderPage();
    expect(await screen.findByText('There are 4 open alerts requiring attention.')).toBeInTheDocument();
  });

  it('lists same-named schools as separate teacher rows, no Inactive figure', async () => {
    mockNemis(
      dashboard({
        schools: [school('a', 'St. Mary', 'Good', 90, 3), school('b', 'St. Mary', 'Good', 85, 2)],
      }),
    );
    renderPage();
    await screen.findByText('Teacher Analytics');
    expect(screen.getAllByRole('cell', { name: 'St. Mary' })).toHaveLength(2);
    expect(screen.queryByText(/Inactive/)).toBeNull();
  });

  it('reads No data for attendance when no month has records', async () => {
    mockNemis(dashboard({ rates: [0, 0, 0] }));
    renderPage();
    const card = (await screen.findByText('Avg Attendance')).closest('div.bg-white') as HTMLElement;
    expect(within(card).getByText('No data')).toBeInTheDocument();
  });

  it('shows the no-district message', async () => {
    mockNemis({ ...dashboard(), districtId: null, district: null, county: null });
    renderPage();
    expect(await screen.findByText('No district assigned to your account.')).toBeInTheDocument();
  });

  it('shows the error state with Retry that reloads', async () => {
    const getDashboard = mockNemis(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Failed to load analytics.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(getDashboard.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('shows no false zeros in the error state', async () => {
    mockNemis(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Failed to load analytics.')).toBeInTheDocument();
    expect(screen.queryByText('Total Teachers')).toBeNull();
    expect(screen.queryByText(/(0%)/)).toBeNull();
    expect(screen.queryByText('No school enrollment data available')).toBeNull();
  });

  it('shows the empty state when every month has no attendance records', async () => {
    mockNemis(dashboard({ rates: [0, 0, 0, 0, 0, 0] }));
    renderPage();
    expect(await screen.findByText('No attendance data')).toBeInTheDocument();
  });
});

describe('DEO sidebar', () => {
  it('lists Analytics right after Generate Reports', () => {
    const items = sidebarConfigs[SystemRole.DEO].navGroups.flatMap((g) => g.items);
    const i = items.findIndex((x) => x.name === 'Generate Reports');
    expect(items[i + 1]).toMatchObject({ name: 'Analytics', href: '/government/deo/analytics' });
  });
});
