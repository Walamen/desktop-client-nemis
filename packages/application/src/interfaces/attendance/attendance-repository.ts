import type { Attendance } from '@nemis-desktop/domain';

export interface IAttendanceRepository {
  save(attendance: Attendance): void;
  findByClassAndDate(classId: string, date: string): Attendance[];
}
