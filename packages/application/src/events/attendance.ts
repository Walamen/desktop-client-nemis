import type { ApplicationEvent } from '../interfaces/event-publisher';
import type { AttendanceStatus } from '@nemis-desktop/types';

export interface AttendanceRecorded extends ApplicationEvent {
  readonly name: 'AttendanceRecorded';
  readonly attendanceId: string;
  readonly studentId: string;
  readonly date: string;
  readonly status: AttendanceStatus;
}
