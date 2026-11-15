import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DeoDashboardResult, DeoSchoolRow } from '@nemis-desktop/types';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DeoDashboard from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function school(
  id: string,
  name: string,
  overrides: Partial<DeoSchoolRow> = {},
): DeoSchoolRow {
  return {
    id,
    name,
    code: id.toUpperCase(),
    levels: ['PRIMARY'],
    students: 100,
    teachers: 4,
    attendanceRate: 90,
    lastSubmissionAt: null,
    performanceStatus: 'Good',
    complianceStatus: 'Compliant',
    feeCollectionRate: null,
    ...overrides,
  };
}

const DASHBOARD: DeoDashboardResult = {
  districtId: 'd-1',
  district: { id: 'd-1', name: 'Buchanan' },
  county: { id: 'c-1', name: 'Grand Bassa' },
  stats: { totalSchools: 12, totalStudents: 2480, totalTeachers: 96, feeCompliance: 64 },
  alerts: [
    {
      id: 'a-1',
      type: 'INFRASTRUCTURE',
      severity: 'CRITICAL',
      title: 'Roof collapsed',
      description: 'Classroom 3 is unsafe',
      institutionId: 's-01',
      createdAt: '2026-11-10T08:00:00.000Z',
    },
  ],
  alertSummary: { total: 1, critical: 1, high: 0, medium: 0, low: 0 },
  schools: [
    school('s-01', 'Alpha Academy', { complianceStatus: 'Flagged' }),
    school('s-02', 'Beta School', { attendanceRate: null, performanceStatus: 'No Data' }),
    ...Array.from({ length: 10 }, (_, i) => school(`s-${i + 3}`, `School ${String(i + 3).padStart(2, '0')}`)),
    school('s-99', 'Zeta Critical', { attendanceRate: 40, performanceStatus: 'Critical' }),
  ],
  chartData: {
    enrollmentTrend: [{ period: 'Nov 2026', enrollment: 2480 }],
    attendanceTrend: [{ period: 'Nov 2026', rate: 82 }],
    genderDistribution: { male: 1200, female: 1280 },
  },
  submissions: [
    {
      id: 'r-1',
      schoolName: 'Alpha Academy',
      title: 'Week 2 summary',
      type: 'WEEKLY_SUMMARY',
      submittedAt: '2026-11-12T10:00:00.000Z',
    },
  ],
};

const NO_DISTRICT: DeoDashboardResult = {
  ...DASHBOARD,
  districtId: null,
  district: null,
  county: null,
  stats: { totalSchools: 0, totalStudents: 0, totalTeachers: 0, feeCompliance: 0 },
  alerts: [],
  alertSummary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
  schools: [],
  submissions: [],
};

function mockNemis(dashboard: DeoDashboardResult) {
  const nemis = {
    deo: {
      getDashboard: vi.fn(async () => dashboard),
      resolveAlert: vi.fn(async () => true),
    },
    yearArchives: { list: vi.fn(async () => []) },
    identity: {
      getCurrentUser: vi.fn(async () => ({
        id: 'deo-1',
        fullName: 'Musu Kollie',
        firstName: 'Musu',
        lastName: 'Kollie',
        email: 'musu@moe.gov.lr',
        isActive: true,
        roles: [],
      })),
    },
  };
  (window as unknown as { nemis: unknown }).nemis = nemis;
  return nemis;
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoDashboard />
    </PresentationProvider>,
  );
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('DEO dashboard page', () => {
  it('greets the officer and names the district and county', async () => {
    mockNemis(DASHBOARD);
    renderPage();
    await waitFor(() => expect(screen.getByText('Musu Kollie')).toBeInTheDocument());
    expect(screen.getByText(/^Good (morning|afternoon|evening),$/)).toBeInTheDocument();
    expect(screen.getByText(/^District Education Officer · Buchanan · Grand Bassa · /)).toBeInTheDocument();
  });

  it('leaves the county out of the banner when its row was never synced', async () => {
    mockNemis({ ...DASHBOARD, county: null });
    renderPage();
    const line = await screen.findByText(/^District Education Officer · Buchanan · /);
    expect(line.textContent).not.toMatch(/County|· ·/);
  });

  it('shows the four KPI cards', async () => {
    mockNemis(DASHBOARD);
    renderPage();
    const kpi = (label: string) => screen.getByText(label).closest('[data-kpi]') as HTMLElement;
    await waitFor(() => expect(screen.getByText('Total Schools')).toBeInTheDocument());
    expect(within(kpi('Total Schools')).getByText('12')).toBeInTheDocument();
    expect(within(kpi('Total Students')).getByText('2,480')).toBeInTheDocument();
    expect(within(kpi('Total Teachers')).getByText('96')).toBeInTheDocument();
    expect(within(kpi('Fee Compliance')).getByText('64%')).toBeInTheDocument();
  });

  it('lists schools at a glance with their compliance, and a dash for missing attendance', async () => {
    mockNemis(DASHBOARD);
    renderPage();
    const glance = (await screen.findByText('Schools at a Glance')).closest('[data-section]') as HTMLElement;
    const alpha = within(glance).getByText('Alpha Academy').closest('tr') as HTMLElement;
    expect(within(alpha).getByText('Flagged')).toBeInTheDocument();
    const beta = within(glance).getByText('Beta School').closest('tr') as HTMLElement;
    expect(within(beta).getByText('—')).toBeInTheDocument();
    expect(within(glance).getByText('View All →').closest('a')).toHaveAttribute('href', '/government/deo/schools');
  });

  it('filters the performance table across every page', async () => {
    mockNemis(DASHBOARD);
    renderPage();
    const table = (await screen.findByText('Detailed School Performance')).closest('[data-section]') as HTMLElement;
    // Zeta sorts last: off the first page of ten.
    expect(within(table).queryByText('Zeta Critical')).not.toBeInTheDocument();
    fireEvent.change(within(table).getByRole('combobox'), { target: { value: 'Critical' } });
    expect(within(table).getByText('Zeta Critical')).toBeInTheDocument();
    expect(within(table).queryByText('Alpha Academy')).not.toBeInTheDocument();
  });

  it('lists submitted school reports', async () => {
    mockNemis(DASHBOARD);
    renderPage();
    const section = (await screen.findByText('Data Submission Monitoring')).closest('[data-section]') as HTMLElement;
    expect(within(section).getByText('Week 2 summary')).toBeInTheDocument();
    expect(within(section).getByText('WEEKLY SUMMARY')).toBeInTheDocument();
  });

  it('marks an incident reviewed on this device', async () => {
    const nemis = mockNemis(DASHBOARD);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark Reviewed' }));
    await waitFor(() => expect(nemis.deo.resolveAlert).toHaveBeenCalledWith('a-1'));
    await waitFor(() => expect(nemis.deo.getDashboard).toHaveBeenCalledTimes(2));
  });

  it('shows the No District Assignment card when no district is assigned', async () => {
    mockNemis(NO_DISTRICT);
    renderPage();
    expect(await screen.findByText('No District Assignment')).toBeInTheDocument();
    expect(screen.queryByText('Total Schools')).not.toBeInTheDocument();
  });

  it('keeps the year closures panel', async () => {
    const nemis = mockNemis(DASHBOARD);
    renderPage();
    await waitFor(() => expect(screen.getByText('Quick Actions')).toBeInTheDocument());
    expect(screen.getByText('Send Broadcast').closest('a')).toHaveAttribute('href', '/government/deo/communications');
    await waitFor(() => expect(nemis.yearArchives.list).toHaveBeenCalled());
  });
});
