import type { CountyEnrollmentReportQuery, CountyReportSchool } from '@nemis-desktop/types';
import type {
  CountyEnrollmentReportData,
  ICountyReportsReadModel,
} from '../../interfaces/county/county-reports-read-model';

/** Settable canned report data; records the last calls. */
export class InMemoryCountyReportsReadModel implements ICountyReportsReadModel {
  options: { countyCode: string | null; districts: { id: string; name: string }[] } = { countyCode: null, districts: [] };
  schoolsByDistrict = new Map<string, CountyReportSchool[]>();
  enrollment: CountyEnrollmentReportData = {
    reportType: 'ENROLLMENT',
    scopeName: null,
    summary: { totalSchools: 0, totalStudents: 0, totalMale: 0, totalFemale: 0, genderRatio: 'N/A' },
    bySchool: [],
    byGradeLevel: [],
    trendData: [],
  };
  /** When set, getEnrollmentReport throws it. */
  enrollmentError: Error | null = null;
  lastEnrollmentQuery: CountyEnrollmentReportQuery | null = null;
  lastNowIso: string | null = null;

  getOptions() {
    return this.options;
  }

  listSchools(districtId: string): CountyReportSchool[] {
    return this.schoolsByDistrict.get(districtId) ?? [];
  }

  getEnrollmentReport(query: CountyEnrollmentReportQuery, nowIso: string): CountyEnrollmentReportData {
    if (this.enrollmentError) throw this.enrollmentError;
    this.lastEnrollmentQuery = query;
    this.lastNowIso = nowIso;
    return this.enrollment;
  }
}
