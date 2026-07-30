import type {
  AttendanceListRequest,
  AttendanceResult,
  RecordAttendanceRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

/** Shared between the teacher portal (recording) and the school-admin portal
 * (reporting) — both read/write the same attendance records, just through
 * different screens (see components/attendance/AttendancePage.tsx vs.
 * AttendanceReportPage.tsx). */
export const attendanceBridge = {
  listAttendance: (request: AttendanceListRequest): Promise<AttendanceResult[]> =>
    api().attendance.list(request),
  recordAttendance: (request: RecordAttendanceRequest): Promise<AttendanceResult> =>
    api().attendance.record(request),
};
