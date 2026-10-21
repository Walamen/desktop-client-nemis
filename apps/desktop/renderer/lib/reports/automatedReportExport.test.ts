import { describe, expect, it } from 'vitest';
import type {
  CountyAcademicReport,
  CountyAttendanceReport,
  CountyEnrollmentReport,
  CountyFinanceDashboard,
  CountySchoolFinanceRow,
  CountyStaffComplianceReport,
} from '@nemis-desktop/types';
import {
  exportFinancialToExcel,
  exportFinancialToPDF,
  exportFinancialToWord,
  exportToExcel,
  exportToPDF,
  exportToWord,
} from './automatedReportExport';

const today = () => new Date().toISOString().split('T')[0];
const options = { countyName: 'Grand Bassa', countyCode: 'GB', generatedBy: 'Musu Kollie' };
const head = (bytes: Uint8Array, n: number) => String.fromCharCode(...bytes.slice(0, n));

const school = { schoolId: 'a', schoolName: 'Alpha School', schoolCode: 'A1', districtId: 'd-1', districtName: 'Buchanan' };
const enrollment: CountyEnrollmentReport = {
  reportType: 'ENROLLMENT',
  generatedAt: '2026-10-20T12:00:00.000Z',
  district: { id: 'county-1', name: 'Grand Bassa' },
  summary: { totalSchools: 1, totalStudents: 30, totalMale: 14, totalFemale: 15, genderRatio: '0.93' },
  byDistrict: [{ districtId: 'd-1', districtName: 'Buchanan', totalSchools: 1, totalStudents: 30, totalMale: 14, totalFemale: 15, genderRatio: '0.93' }],
  bySchool: [{ ...school, totalStudents: 30, male: 14, female: 15 }],
  byGradeLevel: [
    { gradeLevel: 'GRADE_1', male: 7, female: 8, total: 15 },
    { gradeLevel: 'KG', male: 7, female: 7, total: 15 },
  ],
  trendData: [{ month: 'Oct 2026', count: 30 }],
};
const attendance: CountyAttendanceReport = {
  reportType: 'ATTENDANCE',
  generatedAt: '2026-10-20T12:00:00.000Z',
  district: { id: 'd-1', name: 'Buchanan' },
  period: { start: '2026-09-22T12:00:00.000Z', end: '2026-10-20T12:00:00.000Z', type: 'WEEKLY' },
  summary: { totalSchools: 1, totalRecords: 10, presentCount: 7, absentCount: 2, lateCount: 1, overallAttendanceRate: 80 },
  bySchool: [{ ...school, totalStudents: 5, recordsCount: 10, present: 7, absent: 2, late: 1, attendanceRate: 80 }],
  trendData: [{ date: '2026-10-19', rate: 80, present: 7, absent: 2 }],
};
const academic: CountyAcademicReport = {
  reportType: 'ACADEMIC',
  generatedAt: '2026-10-20T12:00:00.000Z',
  district: { id: 'county-1', name: 'Grand Bassa' },
  summary: { totalSchools: 1, totalGrades: 4, averageScore: 70, passRate: 75, passCount: 3, failCount: 1 },
  bySubject: [{ subjectId: 'm', subjectName: 'Mathematics', totalGrades: 4, averageScore: 70, passRate: 75 }],
  bySchool: [{ ...school, totalGrades: 4, averageScore: 70, passRate: 75 }],
};
const staff: CountyStaffComplianceReport = {
  reportType: 'STAFF_COMPLIANCE',
  generatedAt: '2026-10-20T12:00:00.000Z',
  district: { id: 'county-1', name: 'Grand Bassa' },
  summary: { totalSchools: 1, totalStudents: 30, totalStaff: 3, totalTeachers: 2, qualifiedTeachers: 1, qualificationRate: 50, overallTeacherStudentRatio: '15.0' },
  complianceStatus: { compliant: 1, nonCompliant: 0, total: 1, complianceRate: 100 },
  bySchool: [{ ...school, totalStudents: 30, totalStaff: 3, totalTeachers: 2, qualifiedTeachers: 1, teacherStudentRatio: '15.0', isCompliant: true }],
};
const finance = {
  dashboard: {
    county: { id: 'county-1', name: 'Grand Bassa' }, academicYearName: '2025/2026', totalExpected: 1000, totalCollected: 650,
    totalOutstanding: 350, collectionRate: 65, schoolsReporting: 1, totalSchools: 1, studentsPaid: 4, studentsPartial: 1,
    studentsUnpaid: 1, currency: 'LRD',
    districtComparison: [{ districtId: 'd-1', districtName: 'Buchanan', totalExpected: 1000, totalCollected: 650, collectionRate: 65, schoolCount: 1 }],
  } as CountyFinanceDashboard,
  schools: [{
    institutionId: 'a', institutionName: 'Alpha School', institutionCode: 'A1', districtId: 'd-1', districtName: 'Buchanan',
    totalExpected: 1000, totalCollected: 650, totalOutstanding: 350, collectionRate: 65, studentCount: 6, paidCount: 4,
    partialCount: 1, unpaidCount: 1, currency: 'LRD',
  }] as CountySchoolFinanceRow[],
};

describe('report exports', () => {
  it('PDF starts with %PDF and is named <County>-enrollment-report-county-<date>.pdf', async () => {
    const file = await exportToPDF(enrollment, { ...options, countyWide: true });
    expect(head(file.bytes, 4)).toBe('%PDF');
    expect(file.fileName).toBe(`Grand-Bassa-enrollment-report-county-${today()}.pdf`);
  });

  it('Excel is a zip (PK) with a .xlsx name', async () => {
    const file = await exportToExcel(academic, { ...options, countyWide: true });
    expect(head(file.bytes, 2)).toBe('PK');
    expect(file.fileName).toBe(`Grand-Bassa-academic-report-county-${today()}.xlsx`);
  });

  it('Word is a zip with a .docx name', async () => {
    const file = await exportToWord(staff, { ...options, countyWide: true });
    expect(head(file.bytes, 2)).toBe('PK');
    expect(file.fileName).toBe(`Grand-Bassa-staff_compliance-report-county-${today()}.docx`);
  });

  it('single-district names use the district name', async () => {
    const file = await exportToPDF(attendance, { ...options, countyWide: false });
    expect(file.fileName).toBe(`Grand-Bassa-attendance-report-Buchanan-${today()}.pdf`);
  });

  it('every report type builds in every format', async () => {
    for (const report of [enrollment, attendance, academic, staff]) {
      for (const build of [exportToPDF, exportToExcel, exportToWord]) {
        const file = await build(report, { ...options, countyWide: true });
        expect(file.bytes.byteLength).toBeGreaterThan(100);
      }
    }
  });

  it('financial exports build for all three formats', async () => {
    const pdf = await exportFinancialToPDF(finance, options);
    expect(head(pdf.bytes, 4)).toBe('%PDF');
    expect(pdf.fileName).toBe(`Grand-Bassa-financial-report-${today()}.pdf`);
    const xlsx = await exportFinancialToExcel(finance, options);
    expect(xlsx.fileName).toBe(`Grand-Bassa-financial-report-${today()}.xlsx`);
    expect(head(xlsx.bytes, 2)).toBe('PK');
    const docx = await exportFinancialToWord(finance, options);
    expect(head(docx.bytes, 2)).toBe('PK');
    expect(docx.fileName).toMatch(/\.docx$/);
  });
});
