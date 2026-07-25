import type { AttendanceStatus } from './enums';

export interface AttendanceListRequest {
  classId: string;
  date: string;
}

export interface RecordAttendanceRequest extends AttendanceListRequest {
  studentId: string;
  subjectId?: string;
  status: AttendanceStatus;
  recordedBy?: string;
}

export interface AttendanceResult {
  id: string;
  studentId: string;
  classId: string;
  date: string;
  status: AttendanceStatus;
  version: number;
  updatedAt: string;
}
