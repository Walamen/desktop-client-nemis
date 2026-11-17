import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import DeoAutomatedReportsPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const exportFile = { fileName: 'Buchanan-enrollment-report.pdf', bytes: new Uint8Array([37, 80, 68, 70]) };
const exportsLib = vi.hoisted(() => ({
  exportToPDF: vi.fn(),
  exportToExcel: vi.fn(),
  exportToWord: vi.fn(),
}));
vi.mock('@/lib/reports/automatedReportExport', () => exportsLib);

const scope = {
  districtId: 'd-1',
  district: { id: 'd-1', name: 'Buchanan' },
  county: { id: 'c-1', name: 'Grand Bassa', code: 'GB' },
  schools: [
    { id: 'sch-a', name: 'Alpha School' },
    { id: 'sch-b', name: 'Beta School' },
  ],
};

const enrollmentReport = {
  reportType: 'ENROLLMENT',
  generatedAt: '2026-11-17T12:00:00.000Z',
  district: { id: 'd-1', name: 'Buchanan' },
  summary: { totalSchools: 2, totalStudents: 60, totalMale: 28, totalFemale: 30, genderRatio: '0.93' },
  bySchool: [
    { schoolId: 'sch-a', schoolName: 'Alpha School', schoolCode: 'A', totalStudents: 30, male: 14, female: 15, districtId: 'd-1', districtName: 'Buchanan' },
    { schoolId: 'sch-b', schoolName: 'Beta School', schoolCode: 'B', totalStudents: 30, male: 14, female: 15, districtId: 'd-1', districtName: 'Buchanan' },
  ],
  byGradeLevel: [{ gradeLevel: 'GRADE_1', male: 14, female: 15, total: 30 }],
  trendData: [{ month: 'Nov 2026', count: 60 }],
};
const attendanceReport = {
  reportType: 'ATTENDANCE', generatedAt: '2026-11-17T12:00:00.000Z', district: { id: 'd-1', name: 'Buchanan' },
  period: { start: '2026-10-20T12:00:00.000Z', end: '2026-11-17T12:00:00.000Z', type: 'WEEKLY' },
  summary: { totalSchools: 1, totalRecords: 40, presentCount: 30, absentCount: 6, lateCount: 4, overallAttendanceRate: 85 },
  bySchool: [{ schoolId: 'sch-a', schoolName: 'Alpha School', schoolCode: 'A', totalStudents: 10, recordsCount: 40, present: 30,
    absent: 6, late: 4, attendanceRate: 85, districtId: 'd-1', districtName: 'Buchanan' }],
  trendData: [{ date: '2026-11-16', rate: 85, present: 30, absent: 6 }],
};

function renderWith(overrides: Record<string, unknown> = {}) {
  const deo = {
    getReportScope: vi.fn(async () => scope),
    getEnrollmentReport: vi.fn(async () => enrollmentReport),
    getAttendanceReport: vi.fn(async () => attendanceReport),
    getAcademicReport: vi.fn(async () => enrollmentReport),
    getStaffComplianceReport: vi.fn(async () => enrollmentReport),
    ...overrides,
  };
  const system = { saveFile: vi.fn(async () => ({ saved: true, path: 'D:\\Reports\\enrollment.pdf' })) };
  (window as unknown as { nemis: unknown }).nemis = { deo, system };
  for (const build of Object.values(exportsLib)) build.mockReset().mockResolvedValue(exportFile);
  render(
    <PresentationProvider layer={createRendererPresentation()}>
      <DeoAutomatedReportsPage />
    </PresentationProvider>,
  );
  return deo;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

describe('DEO Automated Reports page', () => {
  it('opens on the Enrollment report for the district, with no district choice', async () => {
    const deo = renderWith();
    expect(screen.getByText('Automated Reports')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Alpha School').length).toBeGreaterThan(0));
    expect(deo.getEnrollmentReport).toHaveBeenCalledWith({});
    expect(screen.getByText('Enrollment Report')).toBeInTheDocument();
    expect(screen.queryByText(/Choose district/)).not.toBeInTheDocument();
  });

  it('filters by one of the district schools', async () => {
    const deo = renderWith();
    await waitFor(() => expect(screen.getAllByText('Alpha School').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    fireEvent.change(screen.getByLabelText('School Filter'), { target: { value: 'sch-b' } });
    await waitFor(() => expect(deo.getEnrollmentReport).toHaveBeenLastCalledWith({ schoolId: 'sch-b' }));
    expect(screen.queryByLabelText('Time Period')).not.toBeInTheDocument();
  });

  it('shows Time Period only for Attendance and passes it', async () => {
    const deo = renderWith();
    fireEvent.click(screen.getByRole('button', { name: /Attendance/ }));
    await waitFor(() => expect(deo.getAttendanceReport).toHaveBeenCalledWith({ period: 'WEEKLY' }));
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    fireEvent.change(screen.getByLabelText('Time Period'), { target: { value: 'MONTHLY' } });
    await waitFor(() => expect(deo.getAttendanceReport).toHaveBeenLastCalledWith({ period: 'MONTHLY' }));
  });

  it('exports with the district header the web DEO file uses, and saves through the app', async () => {
    renderWith();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'PDF' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(screen.getByText(/Saved to D:\\Reports\\enrollment\.pdf/)).toBeInTheDocument());
    expect(exportsLib.exportToPDF).toHaveBeenCalledWith(
      expect.objectContaining({ reportType: 'ENROLLMENT' }),
      expect.objectContaining({ countyWide: false, generatedBy: 'District Education Officer' }),
    );
    // No county letterhead: a DEO file is not a County Education Office file.
    expect(exportsLib.exportToPDF.mock.calls[0]![1]).not.toHaveProperty('countyName');
    fireEvent.click(screen.getByRole('button', { name: /Attendance/ }));
    expect(screen.queryByText(/Saved to/)).not.toBeInTheDocument();
  });

  it('a failed report shows the error and Retry reloads it', async () => {
    let calls = 0;
    const deo = renderWith({
      getEnrollmentReport: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error('database locked');
        return enrollmentReport;
      }),
    });
    expect(await screen.findByText('Failed to load report')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByText('Alpha School').length).toBeGreaterThan(0));
    expect(deo.getEnrollmentReport).toHaveBeenCalledTimes(2);
  });

  it('a failed scope load shows the error with Retry, not an endless spinner', async () => {
    let calls = 0;
    const deo = renderWith({
      getReportScope: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error('database locked');
        return scope;
      }),
    });
    expect(await screen.findByText('Failed to load report')).toBeInTheDocument();
    expect(screen.queryByText('Generating report...')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByText('Alpha School').length).toBeGreaterThan(0));
    expect(deo.getEnrollmentReport).toHaveBeenCalledTimes(1);
  });

  it('explains when no district is assigned', async () => {
    renderWith({ getReportScope: vi.fn(async () => ({ districtId: null, district: null, county: null, schools: [] })) });
    expect(await screen.findByText('No district assigned to your account.')).toBeInTheDocument();
  });
});
