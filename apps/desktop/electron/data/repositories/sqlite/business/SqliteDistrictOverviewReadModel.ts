import type {
  DistrictAlertRow,
  DistrictOverviewRef,
  DistrictReportRow,
  DistrictSchoolAdminRow,
  DistrictSchoolRef,
  IDistrictOverviewReadModel,
} from '@nemis-desktop/application';
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
} = TableNames;

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

const ATTENDED = `SUM(CASE WHEN a.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END)`;

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
      // The first active admin by id, as the County school detail reads it.
      return this.#statements
        .get(
          `SELECT a.institutionId AS institutionId, trim(a.firstName || ' ' || a.lastName) AS name
           FROM ${institutionAdmin} a JOIN ${institutions} i ON i.id = a.institutionId
           WHERE ${DISTRICT_SCHOOLS} AND a.isActive = 1
             -- Lowest user id first, as the server picks (districts.service.ts).
             AND a.id = (SELECT b.id FROM ${institutionAdmin} b
                         WHERE b.institutionId = a.institutionId AND b.isActive = 1
                         ORDER BY COALESCE(b.userId, b.id), b.id LIMIT 1)`,
        )
        .all(districtId) as { institutionId: string; name: string }[];
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
}
