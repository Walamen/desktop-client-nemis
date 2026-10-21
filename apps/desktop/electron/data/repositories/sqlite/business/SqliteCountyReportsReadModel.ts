import type {
  CountyAttendancePeriod,
  CountyEnrollmentDistrictRow,
  CountyEnrollmentReportQuery,
  CountyEnrollmentSchoolRow,
  CountyReportSchool,
} from '@nemis-desktop/types';
import type {
  CountyAcademicReportData,
  CountyAttendanceReportData,
  CountyEnrollmentReportData,
  CountyStaffComplianceReportData,
  ICountyReportsReadModel,
} from '@nemis-desktop/application';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded, OWN_COUNTY } from './support';
import { qualificationList } from './SqliteCountyTeachersReadModel';

/** The county's active schools (institution alias `i`). */
const ACTIVE_SCHOOLS = `i.isActive = 1 AND ${OWN_COUNTY}`;
const TREND_MONTHS = 6;
const ATTENDANCE_TREND_DAYS = 14;
/** The server's getTeachingPositions(). */
const TEACHING_POSITIONS = new Set(['TEACHER', 'ASSISTANT_TEACHER']);
/** At most this many students per teacher is compliant. */
const MAX_STUDENTS_PER_TEACHER = 40;
const DEFAULT_PASS_PERCENT = 50;

/** "N/A" with no female students, as the server reports it. */
const genderRatio = (male: number, female: number) => (female > 0 ? (male / female).toFixed(2) : 'N/A');
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

type SchoolRow = { id: string; name: string; code: string; districtId: string | null; districtName: string | null };
type StudentRow = { institutionId: string; gender: string; gradeLevel: string | null; createdAt: string | null };
type Scope = { sql: string; params: unknown[] };

/** SQLite read model for the County Generate Reports page — a port of the
 * server's counties/districts report generators
 * (docs/superpowers/specs/2026-10-20-county-reports-enrollment-financial-design.md,
 * docs/superpowers/specs/2026-10-20-county-reports-remaining-design.md). */
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
      const scope = reportScope(query);
      const schools = this.#schools(scope);
      const students = this.#repository.connection
        .prepare(
          `SELECT s.institutionId, s.gender, s.gradeLevel, s.createdAt
           FROM students s JOIN institutions i ON i.id = s.institutionId
           WHERE s.isActive = 1 AND ${scope.sql}`,
        )
        .all(...scope.params) as StudentRow[];

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
          ...schoolColumns(school),
          totalStudents: counts.total,
          male: counts.male,
          female: counts.female,
          districtId: school.districtId,
          districtName: school.districtName,
        };
      });

      const report: CountyEnrollmentReportData = {
        reportType: 'ENROLLMENT',
        scopeName: this.#scopeName(query),
        summary: {
          totalSchools: schools.length,
          totalStudents: students.length,
          totalMale,
          totalFemale,
          genderRatio: genderRatio(totalMale, totalFemale),
        },
        bySchool,
        byGradeLevel: [...byGrade.values()],
        trendData: enrollmentTrend(students, nowIso),
      };
      if (!query.districtId) report.byDistrict = byDistrict(bySchool);
      return report;
    });
  }

  getAttendanceReport(
    query: CountyEnrollmentReportQuery & { period: CountyAttendancePeriod },
    nowIso: string,
  ): CountyAttendanceReportData {
    return guarded('SqliteCountyReportsReadModel.getAttendanceReport', () => {
      const scope = reportScope(query);
      const schools = this.#schools(scope);
      const { start, end } = attendanceWindow(query.period, nowIso);
      const records = this.#repository.connection
        .prepare(
          `SELECT c.institutionId, substr(a.date, 1, 10) AS day, a.status
           FROM attendance a
           JOIN classes c ON c.id = a.classId
           JOIN institutions i ON i.id = c.institutionId
           WHERE ${scope.sql} AND substr(a.date, 1, 10) BETWEEN ? AND ?`,
        )
        .all(...scope.params, localDay(start), localDay(end)) as { institutionId: string; day: string; status: string }[];
      const studentCounts = this.#activeStudentCounts(scope);

      const tally = () => ({ total: 0, present: 0, absent: 0, late: 0 });
      const overall = tally();
      const perSchool = new Map<string, ReturnType<typeof tally>>();
      const perDay = new Map<string, ReturnType<typeof tally>>();
      for (const record of records) {
        for (const t of [
          overall,
          perSchool.get(record.institutionId) ?? perSchool.set(record.institutionId, tally()).get(record.institutionId)!,
          perDay.get(record.day) ?? perDay.set(record.day, tally()).get(record.day)!,
        ]) {
          t.total += 1;
          if (record.status === 'PRESENT') t.present += 1;
          else if (record.status === 'ABSENT') t.absent += 1;
          else if (record.status === 'LATE') t.late += 1;
        }
      }
      // LATE arrivals attended, as the parent and guardian portals count them.
      const attendedRate = (t: ReturnType<typeof tally>) => percent(t.present + t.late, t.total);

      return {
        reportType: 'ATTENDANCE',
        scopeName: this.#scopeName(query),
        period: { start: start.toISOString(), end: end.toISOString(), type: query.period },
        summary: {
          totalSchools: schools.length,
          totalRecords: overall.total,
          presentCount: overall.present,
          absentCount: overall.absent,
          lateCount: overall.late,
          overallAttendanceRate: attendedRate(overall),
        },
        bySchool: schools.map((school) => {
          const t = perSchool.get(school.id) ?? tally();
          return {
            ...schoolColumns(school),
            totalStudents: studentCounts.get(school.id) ?? 0,
            recordsCount: t.total,
            present: t.present,
            absent: t.absent,
            late: t.late,
            attendanceRate: attendedRate(t),
            districtId: school.districtId,
            districtName: school.districtName,
          };
        }),
        trendData: [...perDay.keys()]
          .sort()
          .slice(-ATTENDANCE_TREND_DAYS)
          .map((date) => {
            const t = perDay.get(date)!;
            return { date, rate: attendedRate(t), present: t.present, absent: t.absent };
          }),
      };
    });
  }

  getAcademicReport(query: CountyEnrollmentReportQuery): CountyAcademicReportData {
    return guarded('SqliteCountyReportsReadModel.getAcademicReport', () => {
      const db = this.#repository.connection;
      const scope = reportScope(query);
      const schools = this.#schools(scope);
      // Published grades in a current-year grading period (the grade's own,
      // else its assessment's), credited to the subject's school.
      const grades = db
        .prepare(
          `SELECT g.subjectId, sj.name AS subjectName, sj.institutionId,
                  g.marksObtained, g.maxMarks, asm.totalMarks AS assessmentTotal
           FROM grades g
           JOIN subjects sj ON sj.id = g.subjectId
           JOIN institutions i ON i.id = sj.institutionId
           JOIN students s ON s.id = g.studentId AND s.isActive = 1
           LEFT JOIN assessments asm ON asm.id = g.assessmentId
           JOIN grading_periods gp ON gp.id = COALESCE(g.gradingPeriodId, asm.gradingPeriodId)
           JOIN academic_years y ON y.id = gp.academicYearId AND y.isCurrent = 1
           WHERE g.isPublished = 1 AND ${scope.sql}
           ORDER BY g.id`,
        )
        .all(...scope.params) as {
        subjectId: string;
        subjectName: string;
        institutionId: string;
        marksObtained: number;
        maxMarks: number | null;
        assessmentTotal: number | null;
      }[];
      const thresholds = new Map(
        (
          db
            .prepare(
              `SELECT g.institutionId, g.passingMarks, g.maxMarks FROM institution_grading_configs g
               JOIN institutions i ON i.id = g.institutionId WHERE ${scope.sql}`,
            )
            .all(...scope.params) as { institutionId: string; passingMarks: number; maxMarks: number }[]
        )
          .filter((c) => c.maxMarks > 0)
          .map((c) => [c.institutionId, (c.passingMarks / c.maxMarks) * 100]),
      );

      const tally = () => ({ total: 0, scoreSum: 0, passCount: 0 });
      type Tally = ReturnType<typeof tally>;
      const overall = tally();
      const perSchool = new Map<string, Tally>();
      const perSubject = new Map<string, Tally & { subjectId: string; subjectName: string }>();
      for (const g of grades) {
        const percentage = (g.marksObtained / (g.assessmentTotal || g.maxMarks || 100)) * 100;
        const passed = percentage >= (thresholds.get(g.institutionId) ?? DEFAULT_PASS_PERCENT);
        const name = g.subjectName.trim();
        const key = name.toLowerCase();
        const subject =
          perSubject.get(key) ?? perSubject.set(key, { ...tally(), subjectId: g.subjectId, subjectName: name }).get(key)!;
        for (const t of [
          overall,
          perSchool.get(g.institutionId) ?? perSchool.set(g.institutionId, tally()).get(g.institutionId)!,
          subject,
        ]) {
          t.total += 1;
          t.scoreSum += percentage;
          if (passed) t.passCount += 1;
        }
      }
      const average = (t: Tally) => (t.total > 0 ? Math.round(t.scoreSum / t.total) : 0);

      return {
        reportType: 'ACADEMIC',
        scopeName: this.#scopeName(query),
        summary: {
          totalSchools: schools.length,
          totalGrades: overall.total,
          averageScore: average(overall),
          passRate: percent(overall.passCount, overall.total),
          passCount: overall.passCount,
          failCount: overall.total - overall.passCount,
        },
        bySubject: [...perSubject.values()].map((s) => ({
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          totalGrades: s.total,
          averageScore: average(s),
          passRate: percent(s.passCount, s.total),
        })),
        bySchool: schools.map((school) => {
          const t = perSchool.get(school.id) ?? tally();
          return {
            ...schoolColumns(school),
            totalGrades: t.total,
            averageScore: average(t),
            passRate: percent(t.passCount, t.total),
            districtId: school.districtId,
            districtName: school.districtName,
          };
        }),
      };
    });
  }

  getStaffComplianceReport(query: CountyEnrollmentReportQuery): CountyStaffComplianceReportData {
    return guarded('SqliteCountyReportsReadModel.getStaffComplianceReport', () => {
      const scope = reportScope(query);
      const schools = this.#schools(scope);
      const staff = this.#repository.connection
        .prepare(
          `SELECT t.institutionId, t.position, t.qualifications
           FROM staff t JOIN institutions i ON i.id = t.institutionId
           WHERE t.isActive = 1 AND ${scope.sql}`,
        )
        .all(...scope.params) as { institutionId: string; position: string; qualifications: string | null }[];
      const studentCounts = this.#activeStudentCounts(scope);

      const perSchool = new Map<string, { staff: number; teachers: number; qualified: number }>();
      for (const member of staff) {
        const counts = perSchool.get(member.institutionId) ?? { staff: 0, teachers: 0, qualified: 0 };
        counts.staff += 1;
        if (TEACHING_POSITIONS.has(member.position)) {
          counts.teachers += 1;
          // Both stored shapes: a string array or the desktop form's { summary }.
          if (qualificationList(member.qualifications).some((q) => q.trim())) counts.qualified += 1;
        }
        perSchool.set(member.institutionId, counts);
      }

      let totalStudents = 0;
      let totalStaff = 0;
      let totalTeachers = 0;
      let qualifiedTeachers = 0;
      const bySchool = schools.map((school) => {
        const counts = perSchool.get(school.id) ?? { staff: 0, teachers: 0, qualified: 0 };
        const students = studentCounts.get(school.id) ?? 0;
        totalStudents += students;
        totalStaff += counts.staff;
        totalTeachers += counts.teachers;
        qualifiedTeachers += counts.qualified;
        return {
          ...schoolColumns(school),
          totalStudents: students,
          totalStaff: counts.staff,
          totalTeachers: counts.teachers,
          qualifiedTeachers: counts.qualified,
          teacherStudentRatio: counts.teachers > 0 ? (students / counts.teachers).toFixed(1) : 'N/A',
          isCompliant: counts.teachers > 0 && students / counts.teachers <= MAX_STUDENTS_PER_TEACHER,
          districtId: school.districtId,
          districtName: school.districtName,
        };
      });
      const compliant = bySchool.filter((s) => s.isCompliant).length;

      return {
        reportType: 'STAFF_COMPLIANCE',
        scopeName: this.#scopeName(query),
        summary: {
          totalSchools: schools.length,
          totalStudents,
          totalStaff,
          totalTeachers,
          qualifiedTeachers,
          qualificationRate: percent(qualifiedTeachers, totalTeachers),
          overallTeacherStudentRatio: totalTeachers > 0 ? (totalStudents / totalTeachers).toFixed(1) : 'N/A',
        },
        complianceStatus: {
          compliant,
          nonCompliant: schools.length - compliant,
          total: schools.length,
          complianceRate: percent(compliant, schools.length),
        },
        bySchool,
      };
    });
  }

  /** District name, then school name; schools without a district last. */
  #schools(scope: Scope): SchoolRow[] {
    return this.#repository.connection
      .prepare(
        `SELECT i.id, i.name, i.code, i.districtId, d.name AS districtName
         FROM institutions i LEFT JOIN districts d ON d.id = i.districtId
         WHERE ${scope.sql}
         ORDER BY d.name IS NULL, d.name, i.name, i.id`,
      )
      .all(...scope.params) as SchoolRow[];
  }

  #activeStudentCounts(scope: Scope): Map<string, number> {
    const rows = this.#repository.connection
      .prepare(
        `SELECT s.institutionId, COUNT(*) AS count FROM students s JOIN institutions i ON i.id = s.institutionId
         WHERE s.isActive = 1 AND ${scope.sql} GROUP BY s.institutionId`,
      )
      .all(...scope.params) as { institutionId: string; count: number }[];
    return new Map(rows.map((row) => [row.institutionId, row.count]));
  }

  #scopeName(query: CountyEnrollmentReportQuery): string | null {
    if (!query.districtId) return null;
    const row = this.#repository.connection.prepare(`SELECT name FROM districts WHERE id = ?`).get(query.districtId) as
      | { name: string }
      | undefined;
    return row?.name ?? null;
  }
}

/** Active own-county schools, optionally one district and one school (alias `i`). */
function reportScope(query: CountyEnrollmentReportQuery): Scope {
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
  return { sql: where.join(' AND '), params };
}

function schoolColumns(school: SchoolRow) {
  return { schoolId: school.id, schoolName: school.name, schoolCode: school.code || '' };
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
function enrollmentTrend(students: StudentRow[], nowIso: string): { month: string; count: number }[] {
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

/** The server's windows: 7 days, 28 days or 3 months back, ending now. */
function attendanceWindow(period: CountyAttendancePeriod, nowIso: string): { start: Date; end: Date } {
  const end = new Date(nowIso);
  const start = new Date(end);
  if (period === 'DAILY') start.setDate(end.getDate() - 7);
  else if (period === 'WEEKLY') start.setDate(end.getDate() - 28);
  else start.setMonth(end.getMonth() - 3);
  return { start, end };
}

/** YYYY-MM-DD in local time. */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
