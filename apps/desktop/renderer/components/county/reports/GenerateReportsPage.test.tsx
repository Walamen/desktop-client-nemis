import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { GenerateReportsPage } from './GenerateReportsPage';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

const exportFile = { fileName: 'Grand-Bassa-enrollment-report-county-2026-10-20.pdf', bytes: new Uint8Array([37, 80, 68, 70]) };
const exportsLib = vi.hoisted(() => ({
  exportToPDF: vi.fn(),
  exportToExcel: vi.fn(),
  exportToWord: vi.fn(),
  exportFinancialToPDF: vi.fn(),
  exportFinancialToExcel: vi.fn(),
  exportFinancialToWord: vi.fn(),
}));
vi.mock('@/lib/reports/automatedReportExport', () => exportsLib);

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

const attendanceReport = {
  reportType: 'ATTENDANCE', generatedAt: '2026-10-20T12:00:00.000Z', district: { id: 'county-1', name: 'Grand Bassa' },
  period: { start: '2026-09-22T12:00:00.000Z', end: '2026-10-20T12:00:00.000Z', type: 'WEEKLY' },
  summary: { totalSchools: 1, totalRecords: 40, presentCount: 30, absentCount: 6, lateCount: 4, overallAttendanceRate: 85 },
  bySchool: [{ schoolId: 'sch-a', schoolName: 'Alpha School', schoolCode: 'A', totalStudents: 10, recordsCount: 40, present: 30,
    absent: 6, late: 4, attendanceRate: 85, districtId: 'd-1', districtName: 'Buchanan' }],
  trendData: [{ date: '2026-10-19', rate: 85, present: 30, absent: 6 }],
};
const academicReport = {
  reportType: 'ACADEMIC', generatedAt: '2026-10-20T12:00:00.000Z', district: { id: 'county-1', name: 'Grand Bassa' },
  summary: { totalSchools: 1, totalGrades: 20, averageScore: 71, passRate: 65, passCount: 13, failCount: 7 },
  bySubject: [{ subjectId: 'm', subjectName: 'Mathematics', totalGrades: 20, averageScore: 71, passRate: 65 }],
  bySchool: [{ schoolId: 'sch-a', schoolName: 'Alpha School', schoolCode: 'A', totalGrades: 20, averageScore: 71, passRate: 65,
    districtId: 'd-1', districtName: 'Buchanan' }],
};
const staffReport = {
  reportType: 'STAFF_COMPLIANCE', generatedAt: '2026-10-20T12:00:00.000Z', district: { id: 'county-1', name: 'Grand Bassa' },
  summary: { totalSchools: 2, totalStudents: 90, totalStaff: 6, totalTeachers: 3, qualifiedTeachers: 2, qualificationRate: 67,
    overallTeacherStudentRatio: '30.0' },
  complianceStatus: { compliant: 1, nonCompliant: 1, total: 2, complianceRate: 50 },
  bySchool: [
    { schoolId: 'sch-a', schoolName: 'Alpha School', schoolCode: 'A', totalStudents: 90, totalStaff: 5, totalTeachers: 3,
      qualifiedTeachers: 2, teacherStudentRatio: '30.0', isCompliant: true, districtId: 'd-1', districtName: 'Buchanan' },
    { schoolId: 'sch-b', schoolName: 'Beta School', schoolCode: 'B', totalStudents: 0, totalStaff: 1, totalTeachers: 0,
      qualifiedTeachers: 0, teacherStudentRatio: 'N/A', isCompliant: false, districtId: 'd-1', districtName: 'Buchanan' },
  ],
};

function renderWith(overrides: Record<string, unknown> = {}) {
  const county = {
    getReportOptions: vi.fn(async () => options),
    listReportSchools: vi.fn(async () => [
      { id: 'sch-a', name: 'Alpha School' },
      { id: 'sch-b', name: 'Beta School' },
    ]),
    getEnrollmentReport: vi.fn(async (query: { districtId?: string }) => (query.districtId ? districtReport : countyReport)),
    getFinanceDashboard: vi.fn(async () => financeDashboard),
    getAttendanceReport: vi.fn(async () => attendanceReport),
    getAcademicReport: vi.fn(async () => academicReport),
    getStaffComplianceReport: vi.fn(async () => staffReport),
    listFinanceSchools: vi.fn(async () => [financeSchool('a', 'Alpha School', 72), financeSchool('b', 'Beta School', 45), financeSchool('c', 'Gamma School', 30)]),
    ...overrides,
  };
  const system = { saveFile: vi.fn(async () => ({ saved: true, path: 'D:\\Reports\\enrollment.pdf' })), ...(overrides.system as object) };
  (window as unknown as { nemis: unknown }).nemis = { county, system };
  for (const build of Object.values(exportsLib)) build.mockReset().mockResolvedValue(exportFile);
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
  it('PDF export saves through the app and shows where', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(screen.getByText(/Saved to D:\\Reports\\enrollment\.pdf/)).toBeInTheDocument());
    expect(exportsLib.exportToPDF).toHaveBeenCalledWith(
      expect.objectContaining({ reportType: 'ENROLLMENT' }),
      expect.objectContaining({ countyName: 'Grand Bassa', countyCode: 'GB', countyWide: true, generatedBy: 'County CEO' }),
    );
    const nemis = (window as unknown as { nemis: { system: { saveFile: ReturnType<typeof vi.fn> } } }).nemis;
    expect(nemis.system.saveFile).toHaveBeenCalledWith(exportFile);
  });

  it('Excel and Word use their builders; Financial uses the financial builders', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(exportsLib.exportToExcel).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Word' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Word' }));
    await waitFor(() => expect(exportsLib.exportToWord).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Financial/ }));
    await waitFor(() => expect(screen.getByText('Total Expected')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(exportsLib.exportFinancialToPDF).toHaveBeenCalled());
    expect(exportsLib.exportFinancialToPDF.mock.calls[0]![0]).toMatchObject({ dashboard: expect.objectContaining({ totalExpected: 1000 }) });
  });

  it('a cancelled save shows nothing', async () => {
    renderWith({ system: { saveFile: vi.fn(async () => ({ saved: false })) } });
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'PDF' })).not.toBeDisabled());
    expect(screen.queryByText(/Saved to/)).not.toBeInTheDocument();
    expect(screen.queryByText('Export failed. Please try again.')).not.toBeInTheDocument();
  });

  it('a failed export says so', async () => {
    renderWith({ system: { saveFile: vi.fn(async () => Promise.reject(new Error('disk full'))) } });
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(screen.getByText('Export failed. Please try again.')).toBeInTheDocument());
  });

  it('export buttons wait for the report', async () => {
    renderWith({ getEnrollmentReport: vi.fn(() => new Promise(() => {})) });
    await waitFor(() => expect(screen.getByText(/Generating enrollment report/)).toBeInTheDocument());
    for (const name of ['PDF', 'Excel', 'Word']) expect(screen.getByRole('button', { name })).toBeDisabled();
  });


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

  it('attendance shows six cards and the school table, and switching period reloads with it', async () => {
    const county = renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Attendance/ }));
    await waitFor(() => expect(screen.getByText('Attendance by School')).toBeInTheDocument());
    expect(county.getAttendanceReport).toHaveBeenLastCalledWith({ period: 'WEEKLY' });
    for (const label of ['Total Records', 'Present', 'Absent', 'Late', 'Attendance Rate']) {
      expect(screen.getByText(label, { selector: 'p' })).toBeInTheDocument();
    }
    expect(screen.getByText('85%', { selector: 'span' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Last 3 Months' }));
    await waitFor(() => expect(county.getAttendanceReport).toHaveBeenLastCalledWith({ period: 'MONTHLY' }));
    expect(county.getEnrollmentReport).toHaveBeenCalledTimes(1);
  });

  it('academic shows pass and fail and by-school rows', async () => {
    const county = renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Academic/ }));
    await waitFor(() => expect(screen.getByText('Performance by School')).toBeInTheDocument());
    expect(county.getAcademicReport).toHaveBeenLastCalledWith({});
    expect(screen.getByText('Passed', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Avg Score', { selector: 'p' }).parentElement!.parentElement!.querySelector('p.text-2xl')!.className).toContain('text-secondary');
    expect(screen.getByText('65%', { selector: 'span' })).toBeInTheDocument();
  });

  it('staff shows compliance and the school table, with N/A instead of 1:N/A', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Staff & Compliance/ }));
    await waitFor(() => expect(screen.getByText('Staff Details by School')).toBeInTheDocument());
    expect(screen.getByText('Compliant', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Non-Compliant', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('1:30.0', { selector: 'td' })).toBeInTheDocument();
    expect(screen.getByText('Beta School').closest('tr')!.textContent).toContain('N/A');
    expect(screen.getByText('Beta School').closest('tr')!.textContent).not.toContain('1:N/A');
  });

  it('the period filter shows only for Attendance', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByText('Alpha School')).toBeInTheDocument());
    expect(screen.queryByText('Time Period')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Attendance/ }));
    await waitFor(() => expect(screen.getByText('Time Period')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Academic/ }));
    await waitFor(() => expect(screen.queryByText('Time Period')).not.toBeInTheDocument());
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
