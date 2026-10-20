import type {
  CountyAcademicReport,
  CountyAttendancePeriod,
  CountyAttendanceReport,
  CountyEnrollmentReport,
  CountyEnrollmentReportQuery,
  CountyReportSchool,
  CountyStaffComplianceReport,
} from '@nemis-desktop/types';

/** What a read model computes for a report; the use case adds `generatedAt` and `district`. */
export type CountyReportData<T> = Omit<T, 'generatedAt' | 'district'> & {
  /** The chosen district's name; null when county-wide or not synced. */
  scopeName: string | null;
};

export type CountyEnrollmentReportData = CountyReportData<CountyEnrollmentReport>;
export type CountyAttendanceReportData = CountyReportData<CountyAttendanceReport>;
export type CountyAcademicReportData = CountyReportData<CountyAcademicReport>;
export type CountyStaffComplianceReportData = CountyReportData<CountyStaffComplianceReport>;

/** County (CEO) Generate Reports page, read from this device's synced data
 * (docs/superpowers/specs/2026-10-20-county-reports-enrollment-financial-design.md,
 * docs/superpowers/specs/2026-10-20-county-reports-remaining-design.md). */
export interface ICountyReportsReadModel {
  /** The county's code and its active districts, by name. */
  getOptions(): { countyCode: string | null; districts: { id: string; name: string }[] };
  /** A district's active own-county schools, by name. */
  listSchools(districtId: string): CountyReportSchool[];
  /** counties/districts generate*EnrollmentReport; `nowIso` anchors the six-month trend. */
  getEnrollmentReport(query: CountyEnrollmentReportQuery, nowIso: string): CountyEnrollmentReportData;
  /** generate*AttendanceReport; the period window ends at `nowIso`. */
  getAttendanceReport(
    query: CountyEnrollmentReportQuery & { period: CountyAttendancePeriod },
    nowIso: string,
  ): CountyAttendanceReportData;
  /** generate*AcademicReport: published grades in each school's current year. */
  getAcademicReport(query: CountyEnrollmentReportQuery): CountyAcademicReportData;
  /** generate*StaffComplianceReport. */
  getStaffComplianceReport(query: CountyEnrollmentReportQuery): CountyStaffComplianceReportData;
}
