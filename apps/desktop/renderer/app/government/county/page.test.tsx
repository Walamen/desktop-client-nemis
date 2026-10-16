import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import CountyDashboard from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const DASHBOARD = {
  county: { id: 'county-1', name: 'Grand Bassa' },
  districts: [
    { id: 'd-1', name: 'Buchanan', activeSchoolCount: 2 },
    { id: 'd-2', name: 'Owensgrove', activeSchoolCount: 1 },
  ],
  stats: { totalSchools: 3, totalStudents: 1250, totalTeachers: 48 },
  chartData: {
    enrollmentByDistrict: [
      { districtName: 'Buchanan', studentCount: 1000 },
      { districtName: 'Owensgrove', studentCount: 250 },
    ],
    enrollmentTrend: [{ period: 'Oct 2026', enrollment: 1250, male: 600, female: 650 }],
    genderDistribution: { male: 600, female: 650 },
    attendanceCompliance: [
      { districtName: 'Buchanan', complianceRate: 100 },
      { districtName: 'Owensgrove', complianceRate: 50 },
    ],
    dropoutTrend: [],
  },
  byLevel: { PRIMARY: 1000, SECONDARY: 250 },
};

const EMPTY = {
  county: null,
  districts: [],
  stats: { totalSchools: 0, totalStudents: 0, totalTeachers: 0 },
  chartData: {
    enrollmentByDistrict: [],
    enrollmentTrend: [],
    genderDistribution: { male: 0, female: 0 },
    attendanceCompliance: [],
    dropoutTrend: [],
  },
  byLevel: {},
};

function mockNemis(getDashboard: () => Promise<unknown>) {
  const nemis = {
    county: { getDashboard: vi.fn(getDashboard) },
    identity: {
      getCurrentUser: vi.fn(async () => ({
        id: 'u1', fullName: 'Musu Kollie', email: 'musu@moe.gov.lr', isActive: true, roles: [],
      })),
    },
  };
  (window as unknown as { nemis: unknown }).nemis = nemis;
  return nemis;
}

function renderPage() {
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <CountyDashboard />
    </PresentationProvider>,
  );
}

function statCard(label: string): HTMLElement {
  return screen.getByText(label).closest('a') as HTMLElement;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
  push.mockReset();
});

describe('County dashboard page', () => {
  it('shows the greeting band with the user and county', async () => {
    mockNemis(async () => DASHBOARD);
    renderPage();
    await waitFor(() => expect(screen.getByText('Musu Kollie')).toBeInTheDocument());
    expect(screen.getByText(/County Education Officer — Grand Bassa •/)).toBeInTheDocument();
  });

  it('omits the county name when none has synced, with no placeholder county', async () => {
    mockNemis(async () => ({ ...DASHBOARD, county: null }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/County Education Officer •/)).toBeInTheDocument());
    expect(screen.queryByText(/Grand Bassa/)).not.toBeInTheDocument();
  });

  it('renders the four stat cards with values and links', async () => {
    mockNemis(async () => DASHBOARD);
    renderPage();
    await waitFor(() => expect(screen.getByText('Total Schools')).toBeInTheDocument());
    expect(within(statCard('Total Schools')).getByText('3')).toBeInTheDocument();
    expect(within(statCard('Total Schools')).getByText('Across 2 districts')).toBeInTheDocument();
    expect(statCard('Total Schools')).toHaveAttribute('href', '/government/county/schools');
    expect(within(statCard('Total Students')).getByText('1,250')).toBeInTheDocument();
    expect(statCard('Total Students')).toHaveAttribute('href', '/government/county/students');
    expect(within(statCard('Total Teachers')).getByText('48')).toBeInTheDocument();
    expect(statCard('Total Teachers')).toHaveAttribute('href', '/government/county/teachers');
    expect(within(statCard('Districts')).getByText('2')).toBeInTheDocument();
    expect(statCard('Districts')).toHaveAttribute('href', '/government/county/districts');
    expect(screen.getByText('District Education Scorecard')).toBeInTheDocument();
    expect(screen.getByText('Enrollment by School Type')).toBeInTheDocument();
  });

  it('renders an empty county with zeros and the web placeholders', async () => {
    mockNemis(async () => EMPTY);
    renderPage();
    await waitFor(() => expect(screen.getByText('Total Schools')).toBeInTheDocument());
    expect(within(statCard('Total Schools')).getByText('0')).toBeInTheDocument();
    // Both the School Type card and the by-district chart show it, as on the web.
    expect(screen.getAllByText('No enrollment data available').length).toBeGreaterThan(0);
  });

  it('shows the error alert and retries', async () => {
    const nemis = mockNemis(async () => {
      throw new Error('[INTERNAL] boom');
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/Failed to load county data/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(nemis.county.getDashboard).toHaveBeenCalledTimes(2));
  });

  it('keeps the dashboard on screen while Refresh Data reloads', async () => {
    let calls = 0;
    const nemis = mockNemis(() => {
      calls += 1;
      return calls === 1 ? Promise.resolve(DASHBOARD) : new Promise(() => {});
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Total Schools')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Refresh Data'));
    await waitFor(() => expect(nemis.county.getDashboard).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Total Schools')).toBeInTheDocument();
  });

  it('routes Add New School and Generate Report to their pages', async () => {
    mockNemis(async () => DASHBOARD);
    renderPage();
    await waitFor(() => expect(screen.getByText('Add New School')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Add New School'));
    expect(push).toHaveBeenCalledWith('/government/county/schools/create');
    fireEvent.click(screen.getByText('Generate Report'));
    expect(push).toHaveBeenCalledWith('/government/county/reports/generate');
  });
});
