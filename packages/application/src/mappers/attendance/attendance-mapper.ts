import type { Attendance } from '@nemis-desktop/domain';
import type { AttendanceOutput } from '../../dto/attendance/attendance-dto';

export function toAttendanceOutput(attendance: Attendance): AttendanceOutput {
  return {
    id: attendance.id,
    studentId: attendance.studentId,
    classId: attendance.classId,
    date: attendance.date,
    status: attendance.status,
    version: attendance.version,
    updatedAt: attendance.updatedAt,
  };
}
