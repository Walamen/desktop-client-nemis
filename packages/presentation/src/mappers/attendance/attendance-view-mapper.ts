import type { AttendanceOutput } from '@nemis-desktop/application';
import { formatIsoDate } from '../../formatters/format-date';
import { presentAttendanceStatus } from '../../presenters/present-status';
import type { AttendanceRowView } from '../../view-models/attendance/attendance-views';

export function toAttendanceRowView(dto: AttendanceOutput): AttendanceRowView {
  return {
    id: dto.id,
    studentId: dto.studentId,
    date: formatIsoDate(dto.date),
    status: presentAttendanceStatus(dto.status),
  };
}
