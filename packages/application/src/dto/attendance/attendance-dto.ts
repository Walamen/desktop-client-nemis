import type { AttendanceStatus } from '@nemis-desktop/types';

export interface RecordAttendanceDto {
  studentId: string;
  classId: string;
  subjectId?: string;
  date: string; // ISO date
  status: AttendanceStatus;
  recordedBy?: string;
  remarks?: string;
  /** Audit note captured when a teacher edits an already-recorded, non-today
   * date. Persisted as given — not validated here (see RecordAttendanceUseCase). */
  updateReason?: string;
}

export interface GetAttendanceByClassAndDateDto {
  classId: string;
  date: string;
  subjectId?: string;
}

export interface AttendanceOutput {
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
