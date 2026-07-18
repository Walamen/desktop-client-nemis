import type { AttendanceStatus } from '@nemis-desktop/types';

export interface RecordAttendanceDto {
  studentId: string;
  classId: string;
  subjectId?: string;
  date: string; // ISO date
  status: AttendanceStatus;
  recordedBy?: string;
}

export interface GetAttendanceByClassAndDateDto {
  classId: string;
  date: string;
}

export interface AttendanceOutput {
  id: string;
  studentId: string;
  classId: string;
  date: string;
  status: AttendanceStatus;
  version: number;
  updatedAt: string;
}
