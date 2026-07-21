import { Attendance } from '@nemis-desktop/domain';
import type { IAttendanceRepository } from '@nemis-desktop/application';
import { AttendanceStatus } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface AttendanceRow {
  id: string;
  studentId: string;
  classId: string;
  subjectId: string | null;
  date: string;
  status: string;
  recordedBy: string | null;
  updatedAt: string;
}

/** Rebuilds an Attendance aggregate from a row. Lossy by necessity: the domain
 * entity has no reconstitute and exposes no subjectId/recordedBy getters, so
 * those round-trip as stored (may be NULL) and version resets to 1. The
 * dashboard never reads these; it uses countByDate (exact SQL). */
function toAttendance(row: AttendanceRow): Attendance {
  return Attendance.record({
    id: row.id,
    studentId: row.studentId,
    classId: row.classId,
    subjectId: row.subjectId ?? undefined,
    date: row.date,
    status: row.status as AttendanceStatus,
    recordedBy: row.recordedBy ?? undefined,
    occurredAt: row.updatedAt,
  });
}

/** SQLite adapter for IAttendanceRepository. Only countByDate is on the
 * dashboard path; save/findByClassAndDate are implemented for port completeness
 * (no attendance CRUD UI this phase). */
export class SqliteAttendanceRepository implements IAttendanceRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  save(attendance: Attendance): void {
    guarded('SqliteAttendanceRepository.save', () => {
      this.#statements
        .get(
          `INSERT INTO ${TableNames.attendance}
           (id, studentId, classId, subjectId, date, status, recordedBy, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             status = excluded.status,
             date = excluded.date,
             version = excluded.version,
             updatedAt = excluded.updatedAt,
             lastModifiedBy = excluded.lastModifiedBy`,
        )
        .run(
          attendance.id,
          attendance.studentId,
          attendance.classId,
          attendance.date,
          attendance.status,
          attendance.version,
          attendance.updatedAt,
          attendance.lastModifiedBy ?? null,
        );
    });
  }

  findByClassAndDate(classId: string, date: string): Attendance[] {
    return guarded('SqliteAttendanceRepository.findByClassAndDate', () => {
      const rows = this.#statements
        .get(
          `SELECT id, studentId, classId, subjectId, date, status, recordedBy, updatedAt
           FROM ${TableNames.attendance} WHERE classId = ? AND date = ?`,
        )
        .all(classId, date) as AttendanceRow[];
      return rows.map(toAttendance);
    });
  }

  countByDate(date: string): { present: number; total: number } {
    return guarded('SqliteAttendanceRepository.countByDate', () => {
      const row = this.#statements
        .get(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS present
           FROM ${TableNames.attendance} WHERE date = ?`,
        )
        .get(AttendanceStatus.PRESENT, date) as { total: number; present: number | null };
      return { present: row.present ?? 0, total: row.total };
    });
  }
}
