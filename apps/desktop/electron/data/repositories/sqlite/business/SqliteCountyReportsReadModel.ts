import type {
  CountyEnrollmentDistrictRow,
  CountyEnrollmentReportQuery,
  CountyEnrollmentSchoolRow,
  CountyReportSchool,
} from '@nemis-desktop/types';
import type { CountyEnrollmentReportData, ICountyReportsReadModel } from '@nemis-desktop/application';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded, OWN_COUNTY } from './support';

/** The county's active schools (institution alias `i`). */
const ACTIVE_SCHOOLS = `i.isActive = 1 AND ${OWN_COUNTY}`;
const TREND_MONTHS = 6;

/** "N/A" with no female students, as the server reports it. */
const genderRatio = (male: number, female: number) => (female > 0 ? (male / female).toFixed(2) : 'N/A');

type SchoolRow = { id: string; name: string; code: string; districtId: string | null; districtName: string | null };
type StudentRow = { institutionId: string; gender: string; gradeLevel: string | null; createdAt: string | null };

/** SQLite read model for the County Generate Reports page — a port of the
 * server's counties/districts enrollment report generators
 * (docs/superpowers/specs/2026-10-20-county-reports-enrollment-financial-design.md). */
export class SqliteCountyReportsReadModel implements ICountyReportsReadModel {
  readonly #repository: RepositoryContext;

  constructor(repository: RepositoryContext) {
    this.#repository = repository;
  }

  getOptions(): { countyCode: string | null; districts: { id: string; name: string }[] } {
    return guarded('SqliteCountyReportsReadModel.getOptions', () => {
      const db = this.#repository.connection;
      const county = db.prepare(`SELECT code FROM counties LIMIT 1`).get() as { code: string | null } | undefined;
      const districts = db
        .prepare(
          `SELECT d.id, d.name FROM districts d
           WHERE d.isActive = 1 AND (NOT EXISTS (SELECT 1 FROM counties) OR d.countyId IN (SELECT id FROM counties))
           ORDER BY d.name, d.id`,
        )
        .all() as { id: string; name: string }[];
      return { countyCode: county?.code ?? null, districts };
    });
  }

  listSchools(districtId: string): CountyReportSchool[] {
    return guarded('SqliteCountyReportsReadModel.listSchools', () =>
      this.#repository.connection
        .prepare(`SELECT i.id, i.name FROM institutions i WHERE ${ACTIVE_SCHOOLS} AND i.districtId = ? ORDER BY i.name, i.id`)
        .all(districtId) as CountyReportSchool[],
    );
  }

  getEnrollmentReport(query: CountyEnrollmentReportQuery, nowIso: string): CountyEnrollmentReportData {
    return guarded('SqliteCountyReportsReadModel.getEnrollmentReport', () => {
      const db = this.#repository.connection;
      const where = [ACTIVE_SCHOOLS];
      const params: unknown[] = [];
      if (query.districtId) {
        where.push('i.districtId = ?');
        params.push(query.districtId);
      }
      if (query.schoolId) {
        where.push('i.id = ?');
        params.push(query.schoolId);
      }
      const scope = where.join(' AND ');
      // District name, then school name; schools without a district last.
      const schools = db
        .prepare(
          `SELECT i.id, i.name, i.code, i.districtId, d.name AS districtName
           FROM institutions i LEFT JOIN districts d ON d.id = i.districtId
           WHERE ${scope}
           ORDER BY d.name IS NULL, d.name, i.name, i.id`,
        )
        .all(...params) as SchoolRow[];
      const students = db
        .prepare(
          `SELECT s.institutionId, s.gender, s.gradeLevel, s.createdAt
           FROM students s JOIN institutions i ON i.id = s.institutionId
           WHERE s.isActive = 1 AND ${scope}`,
        )
        .all(...params) as StudentRow[];

      // OTHER (or any non-binary value) counts in totals only.
      let totalMale = 0;
      let totalFemale = 0;
      const perSchool = new Map<string, { total: number; male: number; female: number }>();
      const byGrade = new Map<string, { gradeLevel: string; male: number; female: number; total: number }>();
      for (const student of students) {
        const isMale = student.gender === 'MALE';
        const isFemale = student.gender === 'FEMALE';
        if (isMale) totalMale += 1;
        if (isFemale) totalFemale += 1;
        const counts = perSchool.get(student.institutionId) ?? { total: 0, male: 0, female: 0 };
        counts.total += 1;
        if (isMale) counts.male += 1;
        if (isFemale) counts.female += 1;
        perSchool.set(student.institutionId, counts);
        const level = student.gradeLevel || 'UNKNOWN';
        const grade = byGrade.get(level) ?? { gradeLevel: level, male: 0, female: 0, total: 0 };
        grade.total += 1;
        if (isMale) grade.male += 1;
        if (isFemale) grade.female += 1;
        byGrade.set(level, grade);
      }

      const bySchool: CountyEnrollmentSchoolRow[] = schools.map((school) => {
        const counts = perSchool.get(school.id) ?? { total: 0, male: 0, female: 0 };
        return {
          schoolId: school.id,
          schoolName: school.name,
          schoolCode: school.code || '',
          totalStudents: counts.total,
          male: counts.male,
          female: counts.female,
          districtId: school.districtId,
          districtName: school.districtName,
        };
      });

      const report: CountyEnrollmentReportData = {
        reportType: 'ENROLLMENT',
        scopeName: query.districtId ? this.#districtName(query.districtId) : null,
        summary: {
          totalSchools: schools.length,
          totalStudents: students.length,
          totalMale,
          totalFemale,
          genderRatio: genderRatio(totalMale, totalFemale),
        },
        bySchool,
        byGradeLevel: [...byGrade.values()],
        trendData: trend(students, nowIso),
      };
      if (!query.districtId) report.byDistrict = byDistrict(bySchool);
      return report;
    });
  }

  #districtName(districtId: string): string | null {
    const row = this.#repository.connection.prepare(`SELECT name FROM districts WHERE id = ?`).get(districtId) as
      | { name: string }
      | undefined;
    return row?.name ?? null;
  }
}

/** Per district, in bySchool order; schools without one under "Unknown District". */
function byDistrict(bySchool: CountyEnrollmentSchoolRow[]): CountyEnrollmentDistrictRow[] {
  const districts = new Map<string, CountyEnrollmentDistrictRow>();
  for (const school of bySchool) {
    const id = school.districtId || 'unknown';
    const row = districts.get(id) ?? {
      districtId: id,
      districtName: school.districtName || 'Unknown District',
      totalSchools: 0,
      totalStudents: 0,
      totalMale: 0,
      totalFemale: 0,
      genderRatio: 'N/A',
    };
    row.totalSchools += 1;
    row.totalStudents += school.totalStudents;
    row.totalMale += school.male;
    row.totalFemale += school.female;
    districts.set(id, row);
  }
  return [...districts.values()].map((row) => ({ ...row, genderRatio: genderRatio(row.totalMale, row.totalFemale) }));
}

/** Last six calendar months, oldest first: in-scope active students registered
 * by each month's end (local time). A student without createdAt never counts. */
function trend(students: StudentRow[], nowIso: string): { month: string; count: number }[] {
  const now = new Date(nowIso);
  const created = students.flatMap((s) => (s.createdAt ? [new Date(s.createdAt).getTime()] : []));
  const months: { month: string; count: number }[] = [];
  for (let back = TREND_MONTHS - 1; back >= 0; back -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - back + 1, 0, 23, 59, 59, 999).getTime();
    months.push({
      month: start.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      count: created.filter((time) => time <= end).length,
    });
  }
  return months;
}
