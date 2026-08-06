import type { Attendance } from '@nemis-desktop/domain';
import { AttendanceStatus } from '@nemis-desktop/types';
import type { IAttendanceRepository } from '../../interfaces/attendance/attendance-repository';

export class InMemoryAttendanceRepository implements IAttendanceRepository {
  readonly store = new Map<string, Attendance>();

  save(attendance: Attendance): void {
    // Mirrors SqliteAttendanceRepository: one row per (studentId, subjectId, date).
    for (const [id, existing] of this.store) {
      if (
        existing.studentId === attendance.studentId &&
        existing.subjectId === attendance.subjectId &&
        existing.date === attendance.date
      ) {
        this.store.delete(id);
      }
    }
    this.store.set(attendance.id, attendance);
  }

  findByClassAndDate(classId: string, date: string, subjectId?: string): Attendance[] {
    return [...this.store.values()].filter(
      (a) => a.classId === classId && a.date === date && (subjectId === undefined || a.subjectId === subjectId),
    );
  }

  findExistingId(studentId: string, subjectId: string | undefined, date: string): string | undefined {
    for (const existing of this.store.values()) {
      if (existing.studentId === studentId && existing.subjectId === subjectId && existing.date === date) {
        return existing.id;
      }
    }
    return undefined;
  }

  countByDate(date: string): { present: number; total: number } {
    const onDate = [...this.store.values()].filter((a) => a.date === date);
    const present = onDate.filter((a) => a.status === AttendanceStatus.PRESENT).length;
    return { present, total: onDate.length };
  }
}
