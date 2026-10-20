import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { GenerateReportsPage } from './GenerateReportsPage';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

const options = {
  county: { id: 'county-1', name: 'Grand Bassa', code: 'GB' },
  districts: [
    { id: 'd-1', name: 'Buchanan' },
    { id: 'd-2', name: 'Owensgrove' },
  ],
};

const schoolRow = (id: string, name: string, districtId: string | null, districtName: string | null) => ({
  schoolId: id, schoolName: name, schoolCode: `${id}-CODE`, totalStudents: 30, male: 14, female: 15, districtId, districtName,
});

const countyReport = {
  reportType: 'ENROLLMENT',
  generatedAt: '2026-10-20T12:00:00.000Z',
  district: { id: 'county-1', name: 'Grand Bassa' },
  summary: { totalSchools: 3, totalStudents: 1234, totalMale: 600, totalFemale: 630, genderRatio: '0.95' },
  byDistrict: [
    { districtId: 'd-1', districtName: 'Buchanan', totalSchools: 2, totalStudents: 60, totalMale: 28, totalFemale: 30, genderRatio: '0.93' },
    { districtId: 'unknown', districtName: 'Unknown District', totalSchools: 1, totalStudents: 30, totalMale: 14, totalFemale: 15, genderRatio: '0.93' },
  ],
  bySchool: [
    schoolRow('sch-a', 'Alpha School', 'd-1', 'Buchanan'),
    schoolRow('sch-b', 'Beta School', 'd-1', 'Buchanan'),
    schoolRow('sch-n', 'Nowhere School', null, null),
  ],
  byGradeLevel: [{ gradeLevel: 'GRADE_1', male: 14, female: 15, total: 30 }],
  trendData: [{ month: 'Oct 2026', count: 90 }],
};

const districtReport = {
  ...countyReport,
  district: { id: 'd-1', name: 'Buchanan' },
  summary: { totalSchools: 2, totalStudents: 60, totalMale: 28, totalFemale: 30, genderRatio: '0.93' },
  byDistrict: undefined,
  bySchool: countyReport.bySchool.slice(0, 2),
};

const financeDashboard = {
  county: { id: 'county-1', name: 'Grand Bassa' },
  academicYearName: '2025/2026',
  totalExpected: 1000, totalCollected: 650, totalOutstanding: 350, collectionRate: 65,
  schoolsReporting: 2, totalSchools: 3, studentsPaid: 40, studentsPartial: 10, studentsUnpaid: 5, currency: 'LRD',
  districtComparison: [{ districtId: 'd-1', districtName: 'Buchanan', totalExpected: 1000, totalCollected: 650, collectionRate: 65, schoolCount: 2 }],
};

const financeSchool = (id: string, name: string, collectionRate: number) => ({
  institutionId: id, institutionName: name, institutionCode: `${id}-CODE`, districtId: 'd-1', districtName: 'Buchanan',
  totalExpected: 100, totalCollected: collectionRate, totalOutstanding: 100 - collectionRate, collectionRate,
  studentCount: 10, paidCount: 5, partialCount: 3, unpaidCount: 2, currency: 'LRD',
});

function renderWith(overrides: Record<string, unknown> = {}) {
  const county = {
    getReportOptions: vi.fn(async () => options),
    listReportSchools: vi.fn(async () => [
      { id: 'sch-a', name: 'Alpha School' },
      { id: 'sch-b', name: 'Beta School' },
    ]),
    getEnrollmentReport: vi.fn(async (query: { districtId?: string }) => (query.districtId ? districtReport : countyReport)),
    getFinanceDashboard: vi.fn(async () => financeDashboard),
    listFinanceSchools: vi.fn(async () => [financeSchool('a', 'Alpha School', 72), financeSchool('b', 'Beta School', 45), financeSchool('c', 'Gamma School', 30)]),
    ...overrides,
  };
  (window as unknown as { nemis: unknown }).nemis = { county };
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <GenerateReportsPage />
    </PresentationProvider>,
  );
  return county;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

const card = (label: string) => screen.getByText(label, { selector: 'p' }).closest('div.bg-white, [class*="card"]')!.textContent ?? '';
const districtSelect = () => screen.getByDisplayValue(/All Districts|— Choose district —|Buchanan|Owensgrove/);

describe('County Generate Reports page', () => {
  it('header shows the county name, code and title', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('GB')).toBeInTheDocument());
    expect(screen.getByText('Generate Reports')).toBeInTheDocument();
    expect(screen.getAllByText('Grand Bassa').length).toBeGreaterThan(0);
  });

  it('county-wide enrollment shows the four cards, district sections and school tables', async () => {
    const county = renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    expect(county.getEnrollmentReport).toHaveBeenCalledWith({});
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('Male Students')).toBeInTheDocument();
    expect(screen.getByText('Enrollment by District')).toBeInTheDocument();
    expect(screen.getByText('Unknown District')).toBeInTheDocument();
    expect(screen.getByText('Nowhere School')).toBeInTheDocument();
    expect(screen.queryByText('Gender Ratio')).not.toBeInTheDocument();
    expect(screen.getByText(/Enrollment Report/)).toBeInTheDocument();
    expect(screen.getByText(/— All Districts/)).toBeInTheDocument();
  });

  it('choosing a district shows its schools and the single-district cards with Gender Ratio', async () => {
    const county = renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    fireEvent.change(districtSelect(), { target: { value: 'd-1' } });
    await waitFor(() => expect(screen.getByText('Gender Ratio')).toBeInTheDocument());
    expect(county.listReportSchools).toHaveBeenCalledWith('d-1');
    expect(county.getEnrollmentReport).toHaveBeenLastCalledWith({ districtId: 'd-1' });
    expect(screen.getByText('Enrollment by School')).toBeInTheDocument();
    const schoolSelect = screen.getByDisplayValue('All Schools');
    expect(within(schoolSelect).getAllByRole('option').map((o) => o.textContent)).toEqual(['All Schools', 'Alpha School', 'Beta School']);
  });

  it('changing the district clears the school and reloads once without schoolId', async () => {
    const county = renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    fireEvent.change(districtSelect(), { target: { value: 'd-1' } });
    await waitFor(() => expect(screen.getByDisplayValue('All Schools')).toBeInTheDocument());
    await waitFor(() => expect(within(screen.getByDisplayValue('All Schools')).getAllByRole('option')).toHaveLength(3));
    fireEvent.change(screen.getByDisplayValue('All Schools'), { target: { value: 'sch-a' } });
    await waitFor(() => expect(county.getEnrollmentReport).toHaveBeenLastCalledWith({ districtId: 'd-1', schoolId: 'sch-a' }));
    county.getEnrollmentReport.mockClear();
    fireEvent.change(districtSelect(), { target: { value: 'd-2' } });
    await waitFor(() => expect(county.getEnrollmentReport).toHaveBeenCalledTimes(1));
    expect(county.getEnrollmentReport).toHaveBeenCalledWith({ districtId: 'd-2' });
  });

  it('Financial shows the six cards and per-district tables with the 70/40 badge rule, hides district and school filters', async () => {
    const county = renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Financial/ }));
    await waitFor(() => expect(screen.getByText('Total Expected')).toBeInTheDocument());
    expect(county.getFinanceDashboard).toHaveBeenCalled();
    for (const label of ['Total Collected', 'Total Outstanding', 'Total Schools', 'Schools Reporting', 'Students Paid']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(card('Total Expected')).toContain('LRD 1,000.00');
    expect(screen.queryByDisplayValue('All Districts')).not.toBeInTheDocument();
    const badge = (school: string) => screen.getByText(school).closest('tr')!.querySelector('span')!.className;
    expect(badge('Alpha School')).toContain('bg-active');
    expect(badge('Beta School')).toContain('bg-pending');
    expect(badge('Gamma School')).toContain('bg-error');
  });

  it('Refresh reloads the current report', async () => {
    const county = renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    county.getEnrollmentReport.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await waitFor(() => expect(county.getEnrollmentReport).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Financial/ }));
    await waitFor(() => expect(screen.getByText('Total Expected')).toBeInTheDocument());
    county.getFinanceDashboard.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await waitFor(() => expect(county.getFinanceDashboard).toHaveBeenCalledTimes(1));
  });

  it('an unbuilt type shows Coming Soon and never calls the enrollment channel', async () => {
    const county = renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    county.getEnrollmentReport.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Attendance/ }));
    await waitFor(() => expect(screen.getByText('Attendance Report', { selector: 'h3, h2, p' })).toBeInTheDocument());
    expect(screen.getByText(/has not been migrated/)).toBeInTheDocument();
    expect(county.getEnrollmentReport).not.toHaveBeenCalled();
  });

  it('an enrollment error shows the Failed to load report panel', async () => {
    renderWith({ getEnrollmentReport: vi.fn(async () => Promise.reject(new Error('locked'))) });
    await waitFor(() => expect(screen.getByText('Failed to load report')).toBeInTheDocument());
  });

  it('no district chosen shows the Select a District prompt', async () => {
    const county = renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    county.getEnrollmentReport.mockClear();
    fireEvent.change(districtSelect(), { target: { value: '' } });
    await waitFor(() => expect(screen.getByText('Select a District')).toBeInTheDocument());
    expect(county.getEnrollmentReport).not.toHaveBeenCalled();
  });
});
