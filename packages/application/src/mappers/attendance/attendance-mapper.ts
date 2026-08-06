import type { Attendance } from '@nemis-desktop/domain';
import type { AttendanceOutput } from '../../dto/attendance/attendance-dto';

export function toAttendanceOutput(attendance: Attendance): AttendanceOutput {
  return {
    id: attendance.id,
    studentId: attendance.studentId,
    classId: attendance.classId,
    subjectId: attendance.subjectId,
    date: attendance.date,
    status: attendance.status,
    recordedBy: attendance.recordedBy,
    remarks: attendance.remarks,
    updateReason: attendance.updateReason,
    version: attendance.version,
    updatedAt: attendance.updatedAt,
  };
}
