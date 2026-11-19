import type {
  DistrictAlertRow,
  DistrictOverviewRef,
  DistrictReportRow,
  DistrictSchoolAdminRow,
  DistrictTeacherRow,
  DistrictTransferRow,
  DistrictSchoolRef,
  DeoUserProfile,
  IDistrictOverviewReadModel,
} from '@nemis-desktop/application';
import { LOW_ATTENDANCE_RATE, MIN_RECORDS_TO_JUDGE } from '@nemis-desktop/application';
import { GradeLevel, type CountyMessageRecipient, type DeoFinanceAuditEntry } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded, notSchoolStaffRequest } from './support';

const {
  students,
  institutions,
  institutionAdmin,
  districts,
  counties,
  staff,
  classes,
  attendance,
  terms,
  academicYears,
  alerts,
  reports,
  users,
  subjects: subjects_,
  subjectTeachers,
  classTeachers,
  classSubjectTeachers,
  studentTransfers,
  feeObligations,
  feePayments,
  feePaymentReversals,
  auditLogs,
} = TableNames;

/** KG, K1, K2, GRADE_1 … GRADE_12: the server's GradeLevel enum order. */
const GRADE_RANK = new Map<string, number>(Object.values(GradeLevel).map((grade, index) => [grade, index]));

/** The class a teacher's lead subject falls back to: grade order, then
 * name, then id. Sorted in code, not by SQLite (gradeLevel is TEXT there),
 * so it matches the server's compareClassesForLead
 * (Nemis apps/Server/src/common/district/class-lead-order.ts). */
function compareClassesForLead(
  a: { id: string; gradeLevel: string; name: string },
  b: { id: string; gradeLevel: string; name: string },
): number {
  const rank = (grade: string) => GRADE_RANK.get(grade) ?? Number.MAX_SAFE_INTEGER;
  return rank(a.gradeLevel) - rank(b.gradeLevel) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/** The district's active schools (institution alias `i`). One parameter. */
const DISTRICT_SCHOOLS = `i.districtId = ? AND i.isActive = 1`;

/** Attendance of the district's schools on or after a date. Driven from the
 * classes so each class reads its own slice of idx_attendance_class_date
 * instead of scanning the table. Parameters: sinceDate, districtId. A bare
 * YYYY-MM-DD bound also orders correctly against full ISO timestamps. */
export const ATTENDANCE_SINCE = `FROM ${classes} c
  JOIN ${institutions} i ON i.id = c.institutionId
  JOIN ${attendance} a ON a.classId = c.id AND a.date >= ?
  WHERE ${DISTRICT_SCHOOLS}`;

/** Active pupils at risk per their own school (packages/application
 * use-cases/deo/pupil-risk.ts): records in the district's active schools on
 * or after a date, grouped per pupil, judged with an exact comparison. LATE
 * attends. Parameters: sinceDate, districtId (attendance), districtId (the
 * pupil's own school). Exported for the query-plan test. */
export const AT_RISK_STUDENTS_SQL = `SELECT s.institutionId AS institutionId, COUNT(*) AS count
  FROM (SELECT a.studentId AS studentId, COUNT(*) AS records,
               SUM(CASE WHEN a.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END) AS attended
        ${ATTENDANCE_SINCE}
        GROUP BY a.studentId) p
  JOIN ${students} s ON s.id = p.studentId AND s.isActive = 1
  JOIN ${institutions} si ON si.id = s.institutionId AND si.districtId = ? AND si.isActive = 1
  WHERE p.records >= ${MIN_RECORDS_TO_JUDGE} AND p.attended * 100 < ${LOW_ATTENDANCE_RATE} * p.records
  GROUP BY s.institutionId`;

/** The district's current-term assessments, each with whether it has any
 * grade (through idx_grades_assessment, migration 050). One parameter: the
 * district id. Exported for the query-plan test. */
export const CURRENT_ASSESSMENTS_SQL = `SELECT a.id, a.classId, a.subjectId, c.institutionId,
    EXISTS (SELECT 1 FROM grades g WHERE g.assessmentId = a.id) AS graded
  FROM assessments a
  JOIN classes c ON c.id = a.classId
  JOIN institutions i ON i.id = c.institutionId
  JOIN grading_periods gp ON gp.id = a.gradingPeriodId
  JOIN terms tm ON tm.id = gp.termId AND tm.isCurrent = 1
  JOIN academic_years y ON y.id = tm.academicYearId AND y.isCurrent = 1
  WHERE i.districtId = ? AND i.isActive = 1`;

const ATTENDED = `SUM(CASE WHEN a.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END)`;

/** Payments (alias `p`) at the district's active schools that count: not
 * reversed on the server, and no reversal recorded on this device yet. */
const COUNTED_PAYMENTS = `FROM ${feePayments} p
  JOIN ${institutions} i ON i.id = p.institutionId
  WHERE ${DISTRICT_SCHOOLS} AND p.isReversed = 0
    AND NOT EXISTS (SELECT 1 FROM ${feePaymentReversals} rv WHERE rv.paymentId = p.id)`;

/** What the server writes for fee rules, obligations and payments
 * (Nemis fees/district-finance-audit.ts FINANCE_AUDIT_ENTITY_TYPES). */
const FINANCE_AUDIT_TYPES = `('feeRule','feeObligation','feePayment')`;

function parseProfile(profile: string | null): Record<string, unknown> | null {
  if (!profile) return null;
  try {
    const value: unknown = JSON.parse(profile);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function levelsOf(profile: Record<string, unknown> | null): string[] {
  const levels = profile?.levels;
  return Array.isArray(levels) ? levels.filter((level): level is string => typeof level === 'string') : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** contact.principal, then principalName (Nemis getInstitutionContact). */
function principalOf(profile: Record<string, unknown> | null): string | null {
  const contact = profile?.contact;
  const fromContact =
    typeof contact === 'object' && contact !== null ? text((contact as Record<string, unknown>).principal) : null;
  return fromContact ?? text(profile?.principalName);
}

/** Read-only SQLite adapter for IDistrictOverviewReadModel (DEO dashboard). */
export class SqliteDistrictOverviewReadModel implements IDistrictOverviewReadModel {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  getDistrict(districtId: string): DistrictOverviewRef | null {
    return guarded('SqliteDistrictOverviewReadModel.getDistrict', () => {
      const row = this.#statements
        .get(`SELECT id, name, countyId FROM ${districts} WHERE id = ?`)
        .get(districtId) as DistrictOverviewRef | undefined;
      return row ?? null;
    });
  }

  getCounty(countyId: string): { id: string; name: string } | null {
    return guarded('SqliteDistrictOverviewReadModel.getCounty', () => {
      const row = this.#statements.get(`SELECT id, name FROM ${counties} WHERE id = ?`).get(countyId) as
        | { id: string; name: string }
        | undefined;
      return row ?? null;
    });
  }

  listActiveSchools(districtId: string): DistrictSchoolRef[] {
    return guarded('SqliteDistrictOverviewReadModel.listActiveSchools', () => {
      const rows = this.#statements
        .get(
          `SELECT i.id, i.name, i.code, i.profile FROM ${institutions} i
           WHERE ${DISTRICT_SCHOOLS}
           ORDER BY i.name COLLATE NOCASE ASC, i.id ASC`,
        )
        .all(districtId) as { id: string; name: string; code: string; profile: string | null }[];
      return rows.map((row) => {
        const profile = parseProfile(row.profile);
        return {
          id: row.id,
          name: row.name,
          code: row.code,
          levels: levelsOf(profile),
          metadataPrincipal: principalOf(profile),
        };
      });
    });
  }

  countActiveStudentsBySchool(districtId: string): { institutionId: string; count: number }[] {
    return guarded('SqliteDistrictOverviewReadModel.countActiveStudentsBySchool', () => {
      return this.#statements
        .get(
          `SELECT s.institutionId AS institutionId, COUNT(*) AS count
           FROM ${students} s JOIN ${institutions} i ON i.id = s.institutionId
           WHERE ${DISTRICT_SCHOOLS} AND s.isActive = 1
           GROUP BY s.institutionId`,
        )
        .all(districtId) as { institutionId: string; count: number }[];
    });
  }

  countTeachingStaffBySchool(districtId: string): { institutionId: string; count: number }[] {
    return guarded('SqliteDistrictOverviewReadModel.countTeachingStaffBySchool', () => {
      return this.#statements
        .get(
          `SELECT t.institutionId AS institutionId, COUNT(*) AS count
           FROM ${staff} t JOIN ${institutions} i ON i.id = t.institutionId
           WHERE ${DISTRICT_SCHOOLS} AND t.isActive = 1 AND t.position IN ('TEACHER','ASSISTANT_TEACHER')
           GROUP BY t.institutionId`,
        )
        .all(districtId) as { institutionId: string; count: number }[];
    });
  }

  countActiveStudentsByGender(districtId: string): { gender: string; count: number }[] {
    return guarded('SqliteDistrictOverviewReadModel.countActiveStudentsByGender', () => {
      return this.#statements
        .get(
          `SELECT s.gender AS gender, COUNT(*) AS count
           FROM ${students} s JOIN ${institutions} i ON i.id = s.institutionId
           WHERE ${DISTRICT_SCHOOLS} AND s.isActive = 1
           GROUP BY s.gender`,
        )
        .all(districtId) as { gender: string; count: number }[];
    });
  }

  listActiveStudentCreations(districtId: string, sinceIso: string): { createdAt: string }[] {
    return guarded('SqliteDistrictOverviewReadModel.listActiveStudentCreations', () => {
      return this.#statements
        .get(
          `SELECT s.createdAt AS createdAt
           FROM ${students} s JOIN ${institutions} i ON i.id = s.institutionId
           WHERE ${DISTRICT_SCHOOLS} AND s.isActive = 1 AND s.createdAt >= ?
           ORDER BY s.createdAt ASC`,
        )
        .all(districtId, sinceIso) as { createdAt: string }[];
    });
  }

  attendanceBySchool(
    districtId: string,
    sinceDate: string,
  ): { institutionId: string; records: number; attended: number }[] {
    return guarded('SqliteDistrictOverviewReadModel.attendanceBySchool', () => {
      return this.#statements
        .get(
          `SELECT c.institutionId AS institutionId, COUNT(*) AS records, ${ATTENDED} AS attended
           ${ATTENDANCE_SINCE}
           GROUP BY c.institutionId`,
        )
        .all(sinceDate, districtId) as { institutionId: string; records: number; attended: number }[];
    });
  }

  lastAttendanceDateBySchool(districtId: string): { institutionId: string; date: string }[] {
    return guarded('SqliteDistrictOverviewReadModel.lastAttendanceDateBySchool', () => {
      // MAX per class is one index seek; the outer MAX folds classes into schools.
      return this.#statements
        .get(
          `SELECT institutionId, substr(MAX(lastDate), 1, 10) AS date FROM (
             SELECT c.institutionId AS institutionId,
               (SELECT MAX(a.date) FROM ${attendance} a WHERE a.classId = c.id) AS lastDate
             FROM ${classes} c JOIN ${institutions} i ON i.id = c.institutionId
             WHERE ${DISTRICT_SCHOOLS}
           )
           WHERE lastDate IS NOT NULL
           GROUP BY institutionId`,
        )
        .all(districtId) as { institutionId: string; date: string }[];
    });
  }

  attendanceByMonth(districtId: string, sinceDate: string): { month: string; records: number; attended: number }[] {
    return guarded('SqliteDistrictOverviewReadModel.attendanceByMonth', () => {
      return this.#statements
        .get(
          `SELECT substr(a.date, 1, 7) AS month, COUNT(*) AS records, ${ATTENDED} AS attended
           ${ATTENDANCE_SINCE}
           GROUP BY substr(a.date, 1, 7)
           ORDER BY month ASC`,
        )
        .all(sinceDate, districtId) as { month: string; records: number; attended: number }[];
    });
  }

  schoolsWithRunningTerm(districtId: string, today: string): string[] {
    return guarded('SqliteDistrictOverviewReadModel.schoolsWithRunningTerm', () => {
      const rows = this.#statements
        .get(
          `SELECT DISTINCT y.institutionId AS institutionId
           FROM ${terms} t
           JOIN ${academicYears} y ON y.id = t.academicYearId
           JOIN ${institutions} i ON i.id = y.institutionId
           WHERE ${DISTRICT_SCHOOLS}
             AND substr(t.startDate, 1, 10) <= ? AND substr(t.endDate, 1, 10) >= ?`,
        )
        .all(districtId, today, today) as { institutionId: string }[];
      return rows.map((row) => row.institutionId);
    });
  }

  listOpenAlerts(districtId: string): DistrictAlertRow[] {
    return guarded('SqliteDistrictOverviewReadModel.listOpenAlerts', () => {
      // A district device also holds county-level alerts (the snapshot
      // matches on countyId); those are not this district's to show.
      return this.#statements
        .get(
          `SELECT a.id, a.type, a.severity, a.title, a.description, a.institutionId, a.createdAt
           FROM ${alerts} a
           WHERE a.isResolved = 0
             AND ${notSchoolStaffRequest('a.metadata')}
             AND (a.districtId = ?
                  OR a.institutionId IN (SELECT i.id FROM ${institutions} i WHERE i.districtId = ?))`,
        )
        .all(districtId, districtId) as DistrictAlertRow[];
    });
  }

  listSubmittedReports(districtId: string, limit: number): DistrictReportRow[] {
    return guarded('SqliteDistrictOverviewReadModel.listSubmittedReports', () => {
      return this.#statements
        .get(
          `SELECT r.id, r.schoolId, i.name AS schoolName, r.title, r.type, r.submittedAt
           FROM ${reports} r JOIN ${institutions} i ON i.id = r.schoolId
           WHERE ${DISTRICT_SCHOOLS} AND r.submittedAt IS NOT NULL
           ORDER BY r.submittedAt DESC, r.id DESC
           LIMIT ?`,
        )
        .all(districtId, limit) as DistrictReportRow[];
    });
  }

  lastSubmissionBySchool(districtId: string): { institutionId: string; submittedAt: string }[] {
    return guarded('SqliteDistrictOverviewReadModel.lastSubmissionBySchool', () => {
      return this.#statements
        .get(
          `SELECT r.schoolId AS institutionId, MAX(r.submittedAt) AS submittedAt
           FROM ${reports} r JOIN ${institutions} i ON i.id = r.schoolId
           WHERE ${DISTRICT_SCHOOLS} AND r.submittedAt IS NOT NULL
           GROUP BY r.schoolId`,
        )
        .all(districtId) as { institutionId: string; submittedAt: string }[];
    });
  }

  schoolAdminNameBySchool(districtId: string): { institutionId: string; name: string }[] {
    return guarded('SqliteDistrictOverviewReadModel.schoolAdminNameBySchool', () => {
      // The active admin with the lowest user id whose name is not blank, as
      // the server picks (districts.service.ts firstAdminNameBySchool).
      // Trimmed in JS: SQLite trim() strips only spaces.
      const rows = this.#statements
        .get(
          `SELECT a.institutionId AS institutionId, a.firstName AS firstName, a.lastName AS lastName
           FROM ${institutionAdmin} a JOIN ${institutions} i ON i.id = a.institutionId
           WHERE ${DISTRICT_SCHOOLS} AND a.isActive = 1
           ORDER BY a.institutionId, COALESCE(a.userId, a.id), a.id`,
        )
        .all(districtId) as { institutionId: string; firstName: string | null; lastName: string | null }[];
      const names = new Map<string, string>();
      for (const row of rows) {
        const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
        if (name && !names.has(row.institutionId)) names.set(row.institutionId, name);
      }
      return [...names].map(([institutionId, name]) => ({ institutionId, name }));
    });
  }

  reportMonthsBySchool(districtId: string, sinceDate: string): { institutionId: string; month: string }[] {
    return guarded('SqliteDistrictOverviewReadModel.reportMonthsBySchool', () => {
      return this.#statements
        .get(
          `SELECT DISTINCT r.schoolId AS institutionId, substr(r.submittedAt, 1, 7) AS month
           FROM ${reports} r JOIN ${institutions} i ON i.id = r.schoolId
           WHERE ${DISTRICT_SCHOOLS} AND r.submittedAt IS NOT NULL AND r.submittedAt >= ?
           ORDER BY institutionId ASC, month ASC`,
        )
        .all(districtId, sinceDate) as { institutionId: string; month: string }[];
    });
  }
  listSchoolAdmins(districtId: string, monthStartIso: string, nextMonthIso: string): DistrictSchoolAdminRow[] {
    return guarded('SqliteDistrictOverviewReadModel.listSchoolAdmins', () => {
      // One row per membership; the person is COALESCE(userId, id) (id was
      // the user id before migration 049). The users row carries the
      // account state. A missing users row reads as an active account with
      // no dates rather than hiding the admin.
      const rows = this.#statements
        .get(
          `SELECT COALESCE(a.userId, a.id) AS userId, a.firstName, a.lastName,
                  COALESCE(u.photoUrl, a.photoUrl) AS photoUrl,
                  i.id AS schoolId, i.name AS schoolName,
                  (SELECT s.employeeNumber FROM ${staff} s
                    WHERE s.userId = COALESCE(a.userId, a.id) AND s.institutionId = a.institutionId
                    ORDER BY s.id LIMIT 1) AS employeeNumber,
                  COALESCE(u.isActive, 1) AS isActive,
                  u.createdAt AS joinedAt, u.lastLoginAt AS lastLoginAt,
                  (SELECT COUNT(*) FROM ${reports} r
                    WHERE r.submittedById = COALESCE(a.userId, a.id) AND r.schoolId = a.institutionId
                      AND r.submittedAt >= ? AND r.submittedAt < ?) AS reportsThisMonth
           FROM ${institutionAdmin} a
           JOIN ${institutions} i ON i.id = a.institutionId
           LEFT JOIN ${users} u ON u.id = COALESCE(a.userId, a.id)
           WHERE ${DISTRICT_SCHOOLS} AND a.isActive = 1`,
        )
        .all(monthStartIso, nextMonthIso, districtId) as (Omit<DistrictSchoolAdminRow, 'isActive'> & {
        isActive: number;
      })[];
      return rows.map((row) => ({ ...row, isActive: row.isActive === 1 }));
    });
  }

  countOpenInfrastructureIssuesBySchool(districtId: string): { institutionId: string; count: number }[] {
    return guarded('SqliteDistrictOverviewReadModel.countOpenInfrastructureIssuesBySchool', () => {
      return this.#statements
        .get(
          `SELECT a.institutionId AS institutionId, COUNT(*) AS count
           FROM ${alerts} a JOIN ${institutions} i ON i.id = a.institutionId
           WHERE ${DISTRICT_SCHOOLS} AND a.isResolved = 0 AND a.type = 'INFRASTRUCTURE_ISSUE'
             AND ${notSchoolStaffRequest('a.metadata')}
           GROUP BY a.institutionId`,
        )
        .all(districtId) as { institutionId: string; count: number }[];
    });
  }
  countAtRiskStudentsBySchool(districtId: string, sinceDate: string): { institutionId: string; count: number }[] {
    return guarded('SqliteDistrictOverviewReadModel.countAtRiskStudentsBySchool', () =>
      this.#statements
        .get(AT_RISK_STUDENTS_SQL)
        .all(sinceDate, districtId, districtId) as { institutionId: string; count: number }[],
    );
  }

  listTransfers(districtId: string): DistrictTransferRow[] {
    return guarded('SqliteDistrictOverviewReadModel.listTransfers', () => {
      const rows = this.#statements
        .get(
          `SELECT t.id, t.studentName, t.studentNemisId,
                  t.fromInstitutionId, COALESCE(fi.name, t.fromInstitutionName) AS fromName,
                  t.toInstitutionId, COALESCE(ti.name, t.toInstitutionName) AS toName,
                  CASE WHEN fi.districtId = ? THEN 1 ELSE 0 END AS fromInDistrict,
                  CASE WHEN ti.districtId = ? THEN 1 ELSE 0 END AS toInDistrict,
                  t.status, t.initiatedBy, t.lapsesAt, t.toGradeLevel, t.reason, t.reviewNotes,
                  t.createdAt, t.requestedDate, t.reviewedAt
           FROM ${studentTransfers} t
           LEFT JOIN ${institutions} fi ON fi.id = t.fromInstitutionId
           LEFT JOIN ${institutions} ti ON ti.id = t.toInstitutionId
           WHERE fi.districtId = ? OR ti.districtId = ?
           ORDER BY t.createdAt DESC, t.id ASC`,
        )
        .all(districtId, districtId, districtId, districtId) as Array<{
        id: string;
        studentName: string | null;
        studentNemisId: string | null;
        fromInstitutionId: string;
        fromName: string | null;
        toInstitutionId: string;
        toName: string | null;
        fromInDistrict: number;
        toInDistrict: number;
        status: string;
        initiatedBy: string;
        lapsesAt: string | null;
        toGradeLevel: string | null;
        reason: string;
        reviewNotes: string | null;
        createdAt: string;
        requestedDate: string | null;
        reviewedAt: string | null;
      }>;
      return rows.map((row) => ({
        id: row.id,
        studentName: row.studentName?.trim() || 'Unknown pupil',
        studentNemisId: row.studentNemisId,
        fromSchool: { id: row.fromInstitutionId, name: row.fromName ?? 'Unknown school' },
        toSchool: { id: row.toInstitutionId, name: row.toName ?? 'Unknown school' },
        fromInDistrict: row.fromInDistrict === 1,
        toInDistrict: row.toInDistrict === 1,
        status: row.status,
        initiatedBy: row.initiatedBy,
        lapsesAt: row.lapsesAt,
        requestedGrade: row.toGradeLevel,
        reason: row.reason,
        reviewNotes: row.reviewNotes,
        createdAt: row.createdAt,
        requestedDate: row.requestedDate,
        reviewedAt: row.reviewedAt,
      }));
    });
  }

  listTeachers(districtId: string): DistrictTeacherRow[] {
    return guarded('SqliteDistrictOverviewReadModel.listTeachers', () => {
      const teachers = this.#statements
        .get(
          `SELECT t.id, t.firstName, t.lastName, t.employeeNumber, t.institutionId AS schoolId,
                  i.name AS schoolName, t.approvalStatus
           FROM ${staff} t JOIN ${institutions} i ON i.id = t.institutionId
           WHERE ${DISTRICT_SCHOOLS} AND t.isActive = 1 AND t.position IN ('TEACHER','ASSISTANT_TEACHER')`,
        )
        .all(districtId) as Array<
        Omit<
          DistrictTeacherRow,
          'subjects' | 'firstClassGrade' | 'unassigned' | 'ownedAssessments' | 'ungradedAssessments'
        >
      >;
      if (teachers.length === 0) return [];

      // Current-year classes at the teacher's own school, by either link.
      const firstClass = new Map<string, { id: string; gradeLevel: string; name: string }>();
      for (const row of this.#statements
        .get(
          `SELECT DISTINCT x.staffId AS staffId, c.id AS id, c.gradeLevel AS gradeLevel, c.name AS name
           FROM (SELECT staffId, classId FROM ${classTeachers}
                 UNION SELECT staffId, classId FROM ${classSubjectTeachers}) x
           JOIN ${staff} t ON t.id = x.staffId
           JOIN ${institutions} i ON i.id = t.institutionId
           JOIN ${classes} c ON c.id = x.classId AND c.institutionId = t.institutionId
           JOIN ${academicYears} y ON y.id = c.academicYearId AND y.isCurrent = 1
           WHERE ${DISTRICT_SCHOOLS}`,
        )
        .all(districtId) as { staffId: string; id: string; gradeLevel: string; name: string }[]) {
        const best = firstClass.get(row.staffId);
        if (!best || compareClassesForLead(row, best) < 0) firstClass.set(row.staffId, row);
      }

      const subjects = new Map<string, string[]>();
      for (const row of this.#statements
        .get(
          `SELECT DISTINCT x.staffId AS staffId, sj.name AS name
           FROM (SELECT staffId, subjectId FROM ${subjectTeachers}
                 UNION SELECT staffId, subjectId FROM ${classSubjectTeachers}) x
           JOIN ${subjects_} sj ON sj.id = x.subjectId
           JOIN ${staff} t ON t.id = x.staffId JOIN ${institutions} i ON i.id = t.institutionId
           WHERE ${DISTRICT_SCHOOLS}`,
        )
        .all(districtId) as { staffId: string; name: string }[]) {
        const list = subjects.get(row.staffId) ?? [];
        const name = row.name.trim();
        if (!list.includes(name)) list.push(name);
        subjects.set(row.staffId, list);
      }

      const states = new Map(
        (
          this.#statements
            .get(
              `WITH cur AS MATERIALIZED (${CURRENT_ASSESSMENTS_SQL})
               SELECT t.id AS staffId, COUNT(cur.id) AS owned,
                      COALESCE(SUM(CASE WHEN cur.graded = 0 THEN 1 ELSE 0 END), 0) AS ungraded
               FROM ${staff} t
               JOIN cur ON cur.institutionId = t.institutionId
                AND (EXISTS (SELECT 1 FROM ${classSubjectTeachers} p
                              WHERE p.staffId = t.id AND p.classId = cur.classId AND p.subjectId = cur.subjectId)
                     OR EXISTS (SELECT 1 FROM ${subjectTeachers} s
                                 WHERE s.staffId = t.id AND s.subjectId = cur.subjectId))
               WHERE t.isActive = 1 AND t.position IN ('TEACHER','ASSISTANT_TEACHER')
               GROUP BY t.id`,
            )
            .all(districtId) as { staffId: string; owned: number; ungraded: number }[]
        ).map((row) => [row.staffId, row]),
      );

      return teachers.map((row) => ({
        ...row,
        subjects: [...(subjects.get(row.id) ?? [])].sort((a, b) => a.localeCompare(b)),
        firstClassGrade: firstClass.get(row.id)?.gradeLevel ?? null,
        unassigned: !firstClass.has(row.id),
        ownedAssessments: states.get(row.id)?.owned ?? 0,
        ungradedAssessments: states.get(row.id)?.ungraded ?? 0,
      }));
    });
  }

  financeBySchool(districtId: string): { institutionId: string; allocation: number; collected: number }[] {
    return guarded('SqliteDistrictOverviewReadModel.financeBySchool', () =>
      this.#statements
        .get(
          `SELECT o.institutionId AS institutionId, SUM(o.requiredAmount) AS allocation, SUM(o.totalPaid) AS collected
           FROM ${feeObligations} o
           JOIN ${academicYears} y ON y.id = o.academicYearId AND y.isCurrent = 1
           JOIN ${institutions} i ON i.id = o.institutionId
           WHERE ${DISTRICT_SCHOOLS}
           GROUP BY o.institutionId`,
        )
        .all(districtId) as { institutionId: string; allocation: number; collected: number }[],
    );
  }

  lastPaymentBySchool(districtId: string): { institutionId: string; paidAt: string }[] {
    return guarded('SqliteDistrictOverviewReadModel.lastPaymentBySchool', () =>
      this.#statements
        .get(`SELECT p.institutionId AS institutionId, MAX(p.paidAt) AS paidAt ${COUNTED_PAYMENTS} GROUP BY p.institutionId`)
        .all(districtId) as { institutionId: string; paidAt: string }[],
    );
  }

  paymentsByMonth(districtId: string, sinceIso: string): { month: string; amount: number }[] {
    return guarded('SqliteDistrictOverviewReadModel.paymentsByMonth', () =>
      this.#statements
        .get(
          // 'localtime': months follow this machine's calendar, as the server's do its own.
          `SELECT strftime('%Y-%m', p.paidAt, 'localtime') AS month, SUM(p.amount) AS amount
           ${COUNTED_PAYMENTS} AND p.paidAt >= ?
           GROUP BY month ORDER BY month`,
        )
        .all(districtId, sinceIso) as { month: string; amount: number }[],
    );
  }

  listFinanceAudit(limit: number): DeoFinanceAuditEntry[] {
    return guarded('SqliteDistrictOverviewReadModel.listFinanceAudit', () =>
      this.#statements
        .get(
          `SELECT id, timestamp, actorName, action, entityType, entityId
           FROM ${auditLogs}
           WHERE entityType IN ${FINANCE_AUDIT_TYPES}
           ORDER BY timestamp DESC, id DESC
           LIMIT ?`,
        )
        .all(limit) as DeoFinanceAuditEntry[],
    );
  }

  listSchoolRegistrations(
    districtId: string,
  ): { institutionId: string; approvalStatus: string; approvedAt: string | null; createdAt: string | null }[] {
    return guarded('SqliteDistrictOverviewReadModel.listSchoolRegistrations', () => {
      const rows = this.#statements
        .get(`SELECT i.id AS id, i.approvalStatus AS approvalStatus, i.details AS details FROM ${institutions} i WHERE ${DISTRICT_SCHOOLS}`)
        .all(districtId) as { id: string; approvalStatus: string; details: string | null }[];
      // A date is a non-empty string, else null (older devices lack the keys).
      const date = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
      return rows.map((row) => {
        const details = parseProfile(row.details);
        return {
          institutionId: row.id,
          approvalStatus: row.approvalStatus,
          approvedAt: date(details?.approvedAt),
          createdAt: date(details?.createdAt),
        };
      });
    });
  }

  teacherRosterBySchool(
    districtId: string,
  ): { institutionId: string; total: number; awaitingApproval: number; newestCreatedAt: string | null }[] {
    return guarded('SqliteDistrictOverviewReadModel.teacherRosterBySchool', () =>
      this.#statements
        .get(
          `SELECT t.institutionId AS institutionId, COUNT(*) AS total,
                  SUM(CASE WHEN t.approvalStatus IN ('PENDING','UNDER_REVIEW') THEN 1 ELSE 0 END) AS awaitingApproval,
                  MAX(t.createdAt) AS newestCreatedAt
           FROM ${staff} t JOIN ${institutions} i ON i.id = t.institutionId
           WHERE ${DISTRICT_SCHOOLS} AND t.isActive = 1 AND t.position IN ('TEACHER','ASSISTANT_TEACHER')
           GROUP BY t.institutionId`,
        )
        .all(districtId) as { institutionId: string; total: number; awaitingApproval: number; newestCreatedAt: string | null }[],
    );
  }

  getSchoolProfile(schoolId: string): { address: string | null; establishedYear: number | null } | null {
    return guarded('SqliteDistrictOverviewReadModel.getSchoolProfile', () => {
      const row = this.#statements
        .get(`SELECT street, communityTown, details FROM ${institutions} WHERE id = ?`)
        .get(schoolId) as { street: string | null; communityTown: string | null; details: string | null } | undefined;
      if (!row) return null;
      const parts = [row.street, row.communityTown].map((part) => part?.trim() ?? '').filter((part) => part !== '');
      const year = parseProfile(row.details)?.establishedYear;
      return {
        address: parts.length > 0 ? parts.join(', ') : null,
        establishedYear: typeof year === 'number' && Number.isInteger(year) ? year : null,
      };
    });
  }

  countSchoolStudentsByGender(schoolId: string): { gender: string; count: number }[] {
    return guarded('SqliteDistrictOverviewReadModel.countSchoolStudentsByGender', () =>
      this.#statements
        .get(`SELECT gender, COUNT(*) AS count FROM ${students} WHERE institutionId = ? AND isActive = 1 GROUP BY gender`)
        .all(schoolId) as { gender: string; count: number }[],
    );
  }

  countSchoolStudentsByGrade(schoolId: string): { gradeLevel: string | null; students: number }[] {
    return guarded('SqliteDistrictOverviewReadModel.countSchoolStudentsByGrade', () => {
      const rows = this.#statements
        .get(
          `SELECT gradeLevel, COUNT(*) AS students FROM ${students}
           WHERE institutionId = ? AND isActive = 1 GROUP BY gradeLevel`,
        )
        .all(schoolId) as { gradeLevel: string | null; students: number }[];
      // gradeLevel is TEXT in SQLite: order in code. Null last, unknown strings after known grades.
      const rank = (grade: string | null): number =>
        grade === null ? Number.MAX_SAFE_INTEGER : (GRADE_RANK.get(grade) ?? Number.MAX_SAFE_INTEGER - 1);
      return rows.sort((a, b) => rank(a.gradeLevel) - rank(b.gradeLevel) || (a.gradeLevel ?? '').localeCompare(b.gradeLevel ?? ''));
    });
  }

  getUserProfile(userId: string): DeoUserProfile | null {
    return guarded('SqliteDistrictOverviewReadModel.getUserProfile', () => {
      const row = this.#statements
        .get(`SELECT firstName, lastName, email, phoneNumber FROM users WHERE id = ?`)
        .get(userId) as DeoUserProfile | undefined;
      return row ?? null;
    });
  }

  listMessageContacts(districtId: string, currentUserId: string): CountyMessageRecipient[] {
    return guarded('SqliteDistrictOverviewReadModel.listMessageContacts', () => {
      const rows = this.#statements
        .get(
          `SELECT u.id AS userId, u.firstName, u.lastName, u.photoUrl, o.role, o.institutionId,
                  i.name AS institutionName, d.id AS districtId, d.name AS districtName
           FROM users u
           JOIN user_organizations o ON o.userId = u.id AND o.isActive = 1
           LEFT JOIN ${institutions} i ON i.id = o.institutionId
           LEFT JOIN ${districts} d ON d.id = COALESCE(o.districtId, i.districtId)
           WHERE u.isActive = 1 AND u.id <> @me
             AND ((o.role = 'COUNTY_ADMIN'
                   AND o.countyId = (SELECT dd.countyId FROM ${districts} dd WHERE dd.id = @district))
               OR (o.role = 'INSTITUTION_ADMIN' AND (o.districtId = @district OR i.districtId = @district)))
           ORDER BY u.firstName, u.lastName, u.id, o.id`,
        )
        .all({ me: currentUserId, district: districtId }) as CountyMessageRecipient[];
      // One organisation per person: the first row, i.e. the lowest id.
      const seen = new Set<string>();
      return rows.filter((row) => !seen.has(row.userId) && seen.add(row.userId));
    });
  }
}
