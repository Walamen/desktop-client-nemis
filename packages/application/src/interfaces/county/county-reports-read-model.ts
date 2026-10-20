import type { CountyEnrollmentReport, CountyEnrollmentReportQuery, CountyReportSchool } from '@nemis-desktop/types';

/** What the read model computes; the use case adds `generatedAt` and `district`. */
export type CountyEnrollmentReportData = Omit<CountyEnrollmentReport, 'generatedAt' | 'district'> & {
  /** The chosen district's name; null when county-wide or not synced. */
  scopeName: string | null;
};

/** County (CEO) Generate Reports page, read from this device's synced data
 * (docs/superpowers/specs/2026-10-20-county-reports-enrollment-financial-design.md). */
export interface ICountyReportsReadModel {
  /** The county's code and its active districts, by name. */
  getOptions(): { countyCode: string | null; districts: { id: string; name: string }[] };
  /** A district's active own-county schools, by name. */
  listSchools(districtId: string): CountyReportSchool[];
  /** counties/districts generate*EnrollmentReport; `nowIso` anchors the six-month trend. */
  getEnrollmentReport(query: CountyEnrollmentReportQuery, nowIso: string): CountyEnrollmentReportData;
}
