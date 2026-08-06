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
  remarks: string | null;
  updateReason: string | null;
  updatedAt: string;
}

/** Rebuilds an Attendance aggregate from a row. Lossy by necessity: the domain
 * entity has no reconstitute, so version resets to 1. The dashboard never
 * reads these; it uses countByDate (exact SQL). */
function toAttendance(row: AttendanceRow): Attendance {
  return Attendance.record({
    id: row.id,
    studentId: row.studentId,
    classId: row.classId,
    subjectId: row.subjectId ?? undefined,
    date: row.date,
    status: row.status as AttendanceStatus,
    recordedBy: row.recordedBy ?? undefined,
    remarks: row.remarks ?? undefined,
    updateReason: row.updateReason ?? undefined,
    occurredAt: row.updatedAt,
  });
}

/** SQLite adapter for IAttendanceRepository. */
export class SqliteAttendanceRepository implements IAttendanceRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  save(attendance: Attendance): void {
    guarded('SqliteAttendanceRepository.save', () => {
      // One current record per (student, subject, date) — mirrors the web
      // backend's studentId_subjectId_date unique constraint (classId is not
      // part of the key: a student sits in one class, so it never varies for
      // a given studentId). The `id != ?` exclusion means a same-id edit (the
      // common case — RecordAttendanceUseCase reuses the existing id) deletes
      // nothing and the INSERT below falls through to its ON CONFLICT branch,
      // firing only an update outbox trigger. This DELETE now only fires for
      // a genuine stray duplicate under a different id (e.g. one written
      // before this natural-key-reuse fix existed), self-healing it away.
      // SQLite's `IS ?` (rather than `= ?`) correctly matches NULL when
      // subjectId is unset (general, subject-less marking).
      this.#statements
        .get(
          `DELETE FROM ${TableNames.attendance}
           WHERE studentId = ? AND subjectId IS ? AND date = ? AND id != ?`,
        )
        .run(attendance.studentId, attendance.subjectId ?? null, attendance.date, attendance.id);
      this.#statements
        .get(
          `INSERT INTO ${TableNames.attendance}
           (id, studentId, classId, subjectId, date, status, recordedBy, remarks, updateReason, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             status = excluded.status,
             date = excluded.date,
             recordedBy = excluded.recordedBy,
             remarks = excluded.remarks,
             updateReason = excluded.updateReason,
             version = excluded.version,
             updatedAt = excluded.updatedAt,
             lastModifiedBy = excluded.lastModifiedBy`,
        )
        .run(
          attendance.id,
          attendance.studentId,
          attendance.classId,
          attendance.subjectId ?? null,
          attendance.date,
          attendance.status,
          attendance.recordedBy ?? null,
          attendance.remarks ?? null,
          attendance.updateReason ?? null,
          attendance.version,
          attendance.updatedAt,
          attendance.lastModifiedBy ?? null,
        );
    });
  }

  findExistingId(studentId: string, subjectId: string | undefined, date: string): string | undefined {
    return guarded('SqliteAttendanceRepository.findExistingId', () => {
      const row = this.#statements
        .get(
          `SELECT id FROM ${TableNames.attendance} WHERE studentId = ? AND subjectId IS ? AND date = ?`,
        )
        .get(studentId, subjectId ?? null, date) as { id: string } | undefined;
      return row?.id;
    });
  }

  findByClassAndDate(classId: string, date: string, subjectId?: string): Attendance[] {
    return guarded('SqliteAttendanceRepository.findByClassAndDate', () => {
      const columns =
        'id, studentId, classId, subjectId, date, status, recordedBy, remarks, updateReason, updatedAt';
      const rows =
        subjectId === undefined
          ? (this.#statements
              .get(`SELECT ${columns} FROM ${TableNames.attendance} WHERE classId = ? AND date = ?`)
              .all(classId, date) as AttendanceRow[])
          : (this.#statements
              .get(
                `SELECT ${columns} FROM ${TableNames.attendance}
                 WHERE classId = ? AND date = ? AND subjectId = ?`,
              )
              .all(classId, date, subjectId) as AttendanceRow[]);
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
