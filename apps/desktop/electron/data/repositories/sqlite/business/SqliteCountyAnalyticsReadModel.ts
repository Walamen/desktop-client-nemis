import type {
  CountyDistrictRow,
  CountyRef,
  ICountyAnalyticsReadModel,
} from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const { students, institutions, districts, staff, counties } = TableNames;

/** Active students in active institutions — the server's dashboard filter. */
const ACTIVE_STUDENTS = `FROM ${students} s
  JOIN ${institutions} i ON i.id = s.institutionId
  WHERE s.isActive = 1 AND i.isActive = 1`;

/** Read-only SQLite adapter for ICountyAnalyticsReadModel. */
export class SqliteCountyAnalyticsReadModel implements ICountyAnalyticsReadModel {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  getCounty(): CountyRef | null {
    return guarded('SqliteCountyAnalyticsReadModel.getCounty', () => {
      const row = this.#statements
        .get(`SELECT id, name FROM ${counties} ORDER BY id LIMIT 1`)
        .get() as CountyRef | undefined;
      return row ?? null;
    });
  }

  listActiveDistricts(): CountyDistrictRow[] {
    return guarded('SqliteCountyAnalyticsReadModel.listActiveDistricts', () => {
      return this.#statements
        .get(
          `SELECT d.id, d.name,
             (SELECT COUNT(*) FROM ${institutions} i WHERE i.districtId = d.id AND i.isActive = 1) AS activeSchoolCount
           FROM ${districts} d
           WHERE d.isActive = 1
             -- The snapshot also carries any other county's district a
             -- county school points at; only this county's own count here,
             -- as on the web. No county row (older server): keep them all.
             AND (NOT EXISTS (SELECT 1 FROM ${counties})
                  OR d.countyId IN (SELECT id FROM ${counties}))
           ORDER BY d.name ASC`,
        )
        .all() as CountyDistrictRow[];
    });
  }

  countActiveSchools(): number {
    return guarded('SqliteCountyAnalyticsReadModel.countActiveSchools', () => {
      return (this.#statements
        .get(`SELECT COUNT(*) AS count FROM ${institutions} WHERE isActive = 1`)
        .get() as { count: number }).count;
    });
  }

  countActiveStudents(): number {
    return guarded('SqliteCountyAnalyticsReadModel.countActiveStudents', () => {
      return (this.#statements.get(`SELECT COUNT(*) AS count ${ACTIVE_STUDENTS}`).get() as { count: number }).count;
    });
  }

  countActiveTeachers(): number {
    return guarded('SqliteCountyAnalyticsReadModel.countActiveTeachers', () => {
      return (this.#statements
        .get(
          `SELECT COUNT(*) AS count FROM ${staff} t
           JOIN ${institutions} i ON i.id = t.institutionId
           WHERE t.isActive = 1 AND i.isActive = 1 AND t.position IN ('TEACHER','ASSISTANT_TEACHER')`,
        )
        .get() as { count: number }).count;
    });
  }

  countActiveStudentsByGender(): { gender: string; count: number }[] {
    return guarded('SqliteCountyAnalyticsReadModel.countActiveStudentsByGender', () => {
      return this.#statements
        .get(`SELECT s.gender AS gender, COUNT(*) AS count ${ACTIVE_STUDENTS} GROUP BY s.gender`)
        .all() as { gender: string; count: number }[];
    });
  }

  countActiveStudentsByGradeLevel(): { gradeLevel: string; count: number }[] {
    return guarded('SqliteCountyAnalyticsReadModel.countActiveStudentsByGradeLevel', () => {
      return this.#statements
        .get(
          `SELECT s.gradeLevel AS gradeLevel, COUNT(*) AS count ${ACTIVE_STUDENTS}
             AND s.gradeLevel IS NOT NULL
           GROUP BY s.gradeLevel`,
        )
        .all() as { gradeLevel: string; count: number }[];
    });
  }

  countActiveStudentsByDistrict(): { districtName: string; count: number }[] {
    return guarded('SqliteCountyAnalyticsReadModel.countActiveStudentsByDistrict', () => {
      return this.#statements
        .get(
          `SELECT d.name AS districtName, COUNT(*) AS count
           FROM ${students} s
           JOIN ${institutions} i ON i.id = s.institutionId
           JOIN ${districts} d ON d.id = i.districtId
           WHERE s.isActive = 1 AND i.isActive = 1
           GROUP BY d.name
           ORDER BY d.name ASC`,
        )
        .all() as { districtName: string; count: number }[];
    });
  }

  listActiveStudentCreations(sinceIso: string): { createdAt: string; gender: string }[] {
    return guarded('SqliteCountyAnalyticsReadModel.listActiveStudentCreations', () => {
      return this.#statements
        .get(
          `SELECT s.createdAt AS createdAt, s.gender AS gender ${ACTIVE_STUDENTS}
             AND s.createdAt >= ?
           ORDER BY s.createdAt ASC`,
        )
        .all(sinceIso) as { createdAt: string; gender: string }[];
    });
  }

  listActiveSchoolsForCoverage(): { districtName: string | null; totalStudentCount: number }[] {
    return guarded('SqliteCountyAnalyticsReadModel.listActiveSchoolsForCoverage', () => {
      return this.#statements
        .get(
          `SELECT d.name AS districtName,
             (SELECT COUNT(*) FROM ${students} s WHERE s.institutionId = i.id) AS totalStudentCount
           FROM ${institutions} i
           LEFT JOIN ${districts} d ON d.id = i.districtId
           WHERE i.isActive = 1
           ORDER BY d.name ASC, i.id ASC`,
        )
        .all() as { districtName: string | null; totalStudentCount: number }[];
    });
  }
}
