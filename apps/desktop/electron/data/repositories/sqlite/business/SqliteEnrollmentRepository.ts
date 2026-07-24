import { Enrollment } from '@nemis-desktop/domain';
import type { IEnrollmentRepository } from '@nemis-desktop/application';
import type { EnrollmentStatus } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';
interface Row {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  termId: string;
  enrollmentDate: string;
  status: EnrollmentStatus;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}
const map = (r: Row) =>
  Enrollment.reconstitute({
    ...r,
    occurredAt: r.enrollmentDate,
    lastModifiedBy: r.lastModifiedBy ?? undefined,
  });
export class SqliteEnrollmentRepository implements IEnrollmentRepository {
  readonly #s: StatementCache;
  constructor(c: RepositoryContext) {
    this.#s = new StatementCache(c.connection);
  }
  findById(id: string): Enrollment | null {
    return guarded('Enrollment.findById', () => {
      const r = this.#s.get(`SELECT * FROM ${TableNames.enrollments} WHERE id=?`).get(id) as
        Row | undefined;
      return r ? map(r) : null;
    });
  }
  save(e: Enrollment): void {
    guarded('Enrollment.save', () =>
      this.#s
        .get(
          `INSERT INTO ${TableNames.enrollments} (id,studentId,classId,academicYearId,termId,enrollmentDate,status,version,updatedAt,lastModifiedBy,deviceId) VALUES (?,?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET classId=excluded.classId,status=excluded.status,version=excluded.version,updatedAt=excluded.updatedAt,lastModifiedBy=excluded.lastModifiedBy`,
        )
        .run(
          e.id,
          e.studentId,
          e.classId,
          e.academicYearId,
          e.termId,
          e.enrollmentDate,
          e.status,
          e.version,
          e.updatedAt,
          e.lastModifiedBy ?? null,
        ),
    );
  }
  hasActiveEnrollment(studentId: string, classId: string): boolean {
    return (
      this.#s
        .get(
          `SELECT 1 FROM ${TableNames.enrollments} WHERE studentId=? AND classId=? AND status='ACTIVE'`,
        )
        .get(studentId, classId) !== undefined
    );
  }
  hasEnrollmentForPeriod(studentId: string, academicYearId: string, termId: string): boolean {
    return (
      this.#s
        .get(
          `SELECT 1 FROM ${TableNames.enrollments} WHERE studentId=? AND academicYearId=? AND termId=?`,
        )
        .get(studentId, academicYearId, termId) !== undefined
    );
  }
  findByClassId(classId: string): Enrollment[] {
    return (
      this.#s.get(`SELECT * FROM ${TableNames.enrollments} WHERE classId=?`).all(classId) as Row[]
    ).map(map);
  }
  findByStudentId(studentId: string): Enrollment[] {
    return (
      this.#s
        .get(
          `SELECT * FROM ${TableNames.enrollments} WHERE studentId=? ORDER BY enrollmentDate DESC`,
        )
        .all(studentId) as Row[]
    ).map(map);
  }
}
