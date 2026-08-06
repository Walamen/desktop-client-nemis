import type { Attendance } from '@nemis-desktop/domain';

export interface IAttendanceRepository {
  save(attendance: Attendance): void;
  /** Omitting subjectId returns every subject's records for the class/date
   * (used by the school-admin day-level report); passing it scopes to one
   * subject (used by the teacher's per-subject marking screen). */
  findByClassAndDate(classId: string, date: string, subjectId?: string): Attendance[];
  /** Present-vs-total attendance rows recorded on an ISO date. */
  countByDate(date: string): { present: number; total: number };
}
