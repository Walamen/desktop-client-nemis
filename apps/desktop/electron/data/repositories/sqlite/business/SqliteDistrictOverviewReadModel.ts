import type {
  DistrictAlertRow,
  DistrictOverviewRef,
  DistrictReportRow,
  DistrictSchoolRef,
  IDistrictOverviewReadModel,
} from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const { students, institutions, districts, counties, staff, classes, attendance, terms, academicYears, alerts, reports } =
  TableNames;

/** The district's active schools (institution alias `i`). One parameter. */
const DISTRICT_SCHOOLS = `i.districtId = ? AND i.isActive = 1`;

/** Attendance of the district's schools on or after a date. Driven from the
 * classes so each class reads its own slice of idx_attendance_class_date
 * instead of scanning the table. Parameters: sinceDate, districtId. A bare
 * YYYY-MM-DD bound also orders correctly against full ISO timestamps. */
const ATTENDANCE_SINCE = `FROM ${classes} c
  JOIN ${institutions} i ON i.id = c.institutionId
  JOIN ${attendance} a ON a.classId = c.id AND a.date >= ?
  WHERE ${DISTRICT_SCHOOLS}`;

const ATTENDED = `SUM(CASE WHEN a.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END)`;

function levelsOf(profile: string | null): string[] {
  if (!profile) return [];
  try {
    const levels = (JSON.parse(profile) as { levels?: unknown } | null)?.levels;
    return Array.isArray(levels) ? levels.filter((level): level is string => typeof level === 'string') : [];
  } catch {
    return [];
  }
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
      return rows.map((row) => ({ id: row.id, name: row.name, code: row.code, levels: levelsOf(row.profile) }));
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
}
