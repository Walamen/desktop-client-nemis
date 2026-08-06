import type { AttendanceStatus } from './enums';

export interface AttendanceListRequest {
  classId: string;
  date: string;
  /** Omit to get every subject's records for the class/date (school-admin
   * report); pass to scope to one subject (teacher marking screen). */
  subjectId?: string;
}

export interface RecordAttendanceRequest extends AttendanceListRequest {
  studentId: string;
  status: AttendanceStatus;
  recordedBy?: string;
  remarks?: string;
  /** Audit note captured when editing an already-recorded, non-today date. */
  updateReason?: string;
}

export interface AttendanceResult {
  id: string;
  studentId: string;
  classId: string;
  subjectId?: string;
  date: string;
  status: AttendanceStatus;
  recordedBy?: string;
  remarks?: string;
  updateReason?: string;
  version: number;
  updatedAt: string;
}
