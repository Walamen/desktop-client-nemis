import type { Attendance } from '@nemis-desktop/domain';

export interface IAttendanceRepository {
  save(attendance: Attendance): void;
  /** Omitting subjectId returns every subject's records for the class/date
   * (used by the school-admin day-level report); passing it scopes to one
   * subject (used by the teacher's per-subject marking screen). */
  findByClassAndDate(classId: string, date: string, subjectId?: string): Attendance[];
  /** The id of the current row for this (studentId, subjectId, date) natural
   * key, or undefined if none exists yet. Lets a caller reuse the existing
   * id on an edit instead of minting a new one for what is really an update
   * — see RecordAttendanceUseCase. */
  findExistingId(studentId: string, subjectId: string | undefined, date: string): string | undefined;
  /** Present-vs-total attendance rows recorded on an ISO date. */
  countByDate(date: string): { present: number; total: number };
}
