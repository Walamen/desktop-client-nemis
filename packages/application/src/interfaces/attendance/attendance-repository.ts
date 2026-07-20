import type { Attendance } from '@nemis-desktop/domain';

export interface IAttendanceRepository {
  save(attendance: Attendance): void;
  findByClassAndDate(classId: string, date: string): Attendance[];
  /** Present-vs-total attendance rows recorded on an ISO date. */
  countByDate(date: string): { present: number; total: number };
}
