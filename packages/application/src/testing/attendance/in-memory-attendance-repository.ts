import type { Attendance } from '@nemis-desktop/domain';
import type { IAttendanceRepository } from '../../interfaces/attendance/attendance-repository';

export class InMemoryAttendanceRepository implements IAttendanceRepository {
  readonly store = new Map<string, Attendance>();

  save(attendance: Attendance): void {
    this.store.set(attendance.id, attendance);
  }

  findByClassAndDate(classId: string, date: string): Attendance[] {
    return [...this.store.values()].filter((a) => a.classId === classId && a.date === date);
  }
}
