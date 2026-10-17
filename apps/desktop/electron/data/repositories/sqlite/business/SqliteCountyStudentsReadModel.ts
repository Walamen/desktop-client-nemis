import type {
  CountyStudentDetail,
  CountyStudentListItem,
  CountyStudentsQuery,
  CountyStudentsResult,
  StudentTransferRecord,
  StudentYearRecord,
  YearOutcome,
} from '@nemis-desktop/types';
import type { ICountyStudentsReadModel } from '@nemis-desktop/application';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

/** This county's own schools; with no county row synced (older server), all. */
const OWN_COUNTY = `(NOT EXISTS (SELECT 1 FROM counties) OR i.countyId IN (SELECT id FROM counties))`;
/** counties.service getCountyStudents: students at the county's ACTIVE schools. */
const ACTIVE_SCHOOL = `i.isActive = 1 AND ${OWN_COUNTY}`;

/** counties.service getCountyStudents performance bands. */
function performanceLabel(avg: number | null): string | null {
  if (avg === null) return null;
  if (avg >= 85) return 'Excellent';
  if (avg >= 70) return 'Good';
  if (avg >= 50) return 'Average';
  return 'Below Avg';
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

type ListRow = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  photoUrl: string | null;
  nemisId: string | null;
  isActive: number;
  gender: string;
  institutionId: string;
  institutionName: string;
  districtName: string | null;
  countyName: string | null;
};

/** SQLite read model for the County Students list and student detail
 * (docs/superpowers/specs/2026-10-17-county-students-design.md §5.2–5.3). */
export class SqliteCountyStudentsReadModel implements ICountyStudentsReadModel {
  readonly #statements: StatementCache;
  readonly #repository: RepositoryContext;

  constructor(repository: RepositoryContext) {
    this.#repository = repository;
    this.#statements = new StatementCache(repository.connection);
  }

  listStudents(query: CountyStudentsQuery): Omit<CountyStudentsResult, 'county' | 'districts'> {
    return guarded('SqliteCountyStudentsReadModel.listStudents', () => {
      const where: string[] = [ACTIVE_SCHOOL];
      const params: unknown[] = [];
      if (query.districtId) {
        where.push('i.districtId = ?');
        params.push(query.districtId);
      }
      if (query.institutionId) {
        where.push('s.institutionId = ?');
        params.push(query.institutionId);
      }
      if (query.status === 'active') where.push('s.isActive = 1');
      if (query.status === 'inactive') where.push('s.isActive = 0');
      if (query.search) {
        where.push(`(s.firstName LIKE ? OR s.lastName LIKE ? OR s.nemisId LIKE ?)`);
        const term = `%${query.search}%`;
        params.push(term, term, term);
      }
      if (query.gradeLevel) {
        where.push(`EXISTS (SELECT 1 FROM enrollments e JOIN classes c ON c.id = e.classId
                     WHERE e.studentId = s.id AND e.status = 'ACTIVE' AND c.gradeLevel = ?)`);
        params.push(query.gradeLevel);
      }
      const from = `FROM students s JOIN institutions i ON i.id = s.institutionId WHERE ${where.join(' AND ')}`;
      const db = this.#repository.connection;
      const { total } = db.prepare(`SELECT COUNT(*) AS total ${from}`).get(...params) as { total: number };
      const page = Math.max(query.page, 1);
      const rows = db
        .prepare(
          `SELECT s.id, s.firstName, s.lastName, s.middleName, s.photoUrl, s.nemisId, s.isActive, s.gender,
                  i.id AS institutionId, i.name AS institutionName,
                  (SELECT d.name FROM districts d WHERE d.id = i.districtId) AS districtName,
                  (SELECT c.name FROM counties c WHERE c.id = i.countyId) AS countyName
           ${from} ORDER BY s.lastName ASC LIMIT ? OFFSET ?`,
        )
        .all(...params, query.limit, (page - 1) * query.limit) as ListRow[];

      const data = rows.map((row) => this.#listItem(row));
      // Ported quirk: the performance filter runs after paging (it is computed).
      const filtered =
        query.performance && query.performance !== 'all'
          ? data.filter((d) => d.performanceLabel?.toLowerCase() === query.performance!.toLowerCase())
          : null;
      const shownTotal = filtered ? filtered.length : total;
      return {
        schools: this.#statements
          .get(`SELECT i.id, i.name FROM institutions i WHERE ${ACTIVE_SCHOOL} ORDER BY i.name ASC`)
          .all() as Array<{ id: string; name: string }>,
        stats: this.#stats(),
        data: filtered ?? data,
        total: shownTotal,
        page,
        limit: query.limit,
        totalPages: Math.ceil(shownTotal / query.limit),
      };
    });
  }

  #listItem(row: ListRow): CountyStudentListItem {
    const currentClass = this.#statements
      .get(
        `SELECT c.name, c.gradeLevel FROM enrollments e JOIN classes c ON c.id = e.classId
         WHERE e.studentId = ? AND e.status = 'ACTIVE' ORDER BY e.enrollmentDate DESC, e.id DESC LIMIT 1`,
      )
      .get(row.id) as { name: string; gradeLevel: string } | undefined;
    const latest = this.#statements
      .get(`SELECT percentage FROM term_averages WHERE studentId = ? ORDER BY calculatedAt DESC LIMIT 5`)
      .all(row.id) as Array<{ percentage: number }>;
    const avgPercentage = mean(latest.map((r) => r.percentage));
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      middleName: row.middleName,
      photoUrl: row.photoUrl,
      nemisId: row.nemisId,
      isActive: row.isActive === 1,
      gender: row.gender,
      institution: {
        id: row.institutionId,
        name: row.institutionName,
        districtName: row.districtName,
        countyName: row.countyName,
      },
      currentClass: currentClass ?? null,
      performanceLabel: performanceLabel(avgPercentage),
      avgPercentage,
    };
  }

  /** Total = every student at the county's active schools = active + inactive;
   * male/female count active students, as counties.service does. */
  #stats(): CountyStudentsResult['stats'] {
    const row = this.#statements
      .get(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN s.isActive = 1 AND s.gender = 'MALE' THEN 1 ELSE 0 END), 0) AS male,
                COALESCE(SUM(CASE WHEN s.isActive = 1 AND s.gender = 'FEMALE' THEN 1 ELSE 0 END), 0) AS female,
                COALESCE(SUM(CASE WHEN s.isActive = 1 THEN 1 ELSE 0 END), 0) AS active,
                COALESCE(SUM(CASE WHEN s.isActive = 0 THEN 1 ELSE 0 END), 0) AS inactive
         FROM students s JOIN institutions i ON i.id = s.institutionId WHERE ${ACTIVE_SCHOOL}`,
      )
      .get() as CountyStudentsResult['stats'];
    return row;
  }

  getStudent(id: string): CountyStudentDetail | null {
    return guarded('SqliteCountyStudentsReadModel.getStudent', () => {
      const s = this.#statements
        .get(
          `SELECT s.id, s.firstName, s.middleName, s.lastName, s.nemisId, s.nationalId, s.photoUrl, s.dateOfBirth,
                  s.gender, s.gradeLevel, s.isActive, s.admissionDate, s.phoneNumber, s.email, s.address,
                  i.id AS institutionId, i.name AS institutionName,
                  (SELECT d.name FROM districts d WHERE d.id = i.districtId) AS districtName,
                  (SELECT c.name FROM counties c WHERE c.id = i.countyId) AS countyName
           FROM students s JOIN institutions i ON i.id = s.institutionId
           WHERE s.id = ? AND ${OWN_COUNTY}`,
        )
        .get(id) as
        | (Omit<CountyStudentDetail['student'], 'isActive'> & {
            isActive: number;
            institutionId: string;
            institutionName: string;
            districtName: string | null;
            countyName: string | null;
          })
        | undefined;
      if (!s) return null;
      const current = this.#statements
        .get(
          `SELECT c.name AS className, c.gradeLevel, y.code AS academicYearName, e.enrollmentDate, e.status
           FROM enrollments e JOIN classes c ON c.id = e.classId LEFT JOIN academic_years y ON y.id = e.academicYearId
           WHERE e.studentId = ? AND e.status = 'ACTIVE' ORDER BY e.enrollmentDate DESC, e.id DESC LIMIT 1`,
        )
        .get(id) as CountyStudentDetail['currentEnrollment'] | undefined;
      const guardians = (
        this.#statements
          .get(
            `SELECT g.firstName, g.lastName, g.relationship, g.phoneNumber, g.email, sg.isPrimary
             FROM student_guardians sg JOIN guardians g ON g.id = sg.guardianId
             WHERE sg.studentId = ? ORDER BY sg.isPrimary DESC, g.lastName, g.firstName`,
          )
          .all(id) as Array<Omit<CountyStudentDetail['guardians'][number], 'isPrimary'> & { isPrimary: number }>
      ).map((g) => ({ ...g, isPrimary: g.isPrimary === 1 }));
      return {
        student: {
          id: s.id,
          firstName: s.firstName,
          middleName: s.middleName,
          lastName: s.lastName,
          nemisId: s.nemisId,
          nationalId: s.nationalId,
          photoUrl: s.photoUrl,
          dateOfBirth: s.dateOfBirth,
          gender: s.gender,
          gradeLevel: s.gradeLevel,
          isActive: s.isActive === 1,
          admissionDate: s.admissionDate,
          phoneNumber: s.phoneNumber,
          email: s.email,
          address: s.address,
        },
        institution: { id: s.institutionId, name: s.institutionName, districtName: s.districtName, countyName: s.countyName },
        currentEnrollment: current ?? null,
        guardians,
        years: this.#years(id),
        transfers: this.#transfers(id),
      };
    });
  }

  /** One row per (year, school) from the student's enrolments in local
   * classes; the latest class that year; newest year first. */
  #years(studentId: string): StudentYearRecord[] {
    const enrolments = this.#statements
      .get(
        `SELECT e.academicYearId, y.code AS academicYearName, y.startDate, y.isCurrent, y.institutionId,
                i.name AS institutionName, c.name AS className, c.gradeLevel
         FROM enrollments e
         JOIN academic_years y ON y.id = e.academicYearId
         JOIN classes c ON c.id = e.classId
         LEFT JOIN institutions i ON i.id = y.institutionId
         WHERE e.studentId = ?
         ORDER BY e.enrollmentDate DESC, e.id DESC`,
      )
      .all(studentId) as Array<{
      academicYearId: string;
      academicYearName: string;
      startDate: string | null;
      isCurrent: number;
      institutionId: string;
      institutionName: string | null;
      className: string;
      gradeLevel: string;
    }>;
    const completion = this.#statements.get(
      `SELECT outcome, averageAtDecision FROM grade_completions WHERE studentId = ? AND academicYearId = ? LIMIT 1`,
    );
    const yearAverages = this.#statements.get(
      `SELECT ta.percentage FROM term_averages ta JOIN terms t ON t.id = ta.termId
       WHERE ta.studentId = ? AND t.academicYearId = ?`,
    );
    const attendance = this.#statements.get(
      `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END), 0) AS present
       FROM attendance a JOIN classes c ON c.id = a.classId
       WHERE a.studentId = ? AND c.academicYearId = ?`,
    );
    const seen = new Set<string>();
    const years: StudentYearRecord[] = [];
    for (const e of enrolments) {
      const key = `${e.academicYearId}|${e.institutionId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const stamp = completion.get(studentId, e.academicYearId) as
        | { outcome: YearOutcome; averageAtDecision: number | null }
        | undefined;
      const percentages = (yearAverages.all(studentId, e.academicYearId) as Array<{ percentage: number }>).map(
        (r) => r.percentage,
      );
      const att = attendance.get(studentId, e.academicYearId) as { total: number; present: number };
      years.push({
        academicYearId: e.academicYearId,
        academicYearName: e.academicYearName,
        academicYearStartDate: e.startDate,
        isCurrentYear: e.isCurrent === 1,
        institutionId: e.institutionId,
        institutionName: e.institutionName ?? '',
        className: e.className,
        gradeLevel: e.gradeLevel,
        outcome: stamp?.outcome ?? null,
        average: stamp?.averageAtDecision ?? mean(percentages),
        attendanceRate: att.total === 0 ? null : (att.present * 100) / att.total,
        otherCounty: false,
      });
    }
    return years.sort((a, b) => (b.academicYearStartDate ?? '').localeCompare(a.academicYearStartDate ?? ''));
  }

  #transfers(studentId: string): StudentTransferRecord[] {
    return (
      this.#statements
        .get(
          `SELECT t.id, COALESCE(t.requestedDate, t.createdAt) AS date,
                  COALESCE(t.fromInstitutionName, fi.name, '') AS fromInstitutionName,
                  COALESCE(t.toInstitutionName, ti.name, '') AS toInstitutionName,
                  t.status, t.reason, t.reviewedAt,
                  CASE WHEN u.id IS NULL THEN NULL ELSE u.firstName || ' ' || u.lastName END AS reviewedByName
           FROM student_transfers t
           LEFT JOIN institutions fi ON fi.id = t.fromInstitutionId
           LEFT JOIN institutions ti ON ti.id = t.toInstitutionId
           LEFT JOIN users u ON u.id = t.reviewedBy
           WHERE t.studentId = ?
           ORDER BY date DESC, t.id DESC`,
        )
        .all(studentId) as StudentTransferRecord[]
    ).map((t) => ({
      id: t.id,
      date: t.date,
      fromInstitutionName: t.fromInstitutionName,
      toInstitutionName: t.toInstitutionName,
      status: t.status,
      reason: t.reason,
      reviewedByName: t.reviewedByName,
      reviewedAt: t.reviewedAt,
    }));
  }
}
