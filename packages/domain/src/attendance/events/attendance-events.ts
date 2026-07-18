import type { DomainEvent } from '../../core';
import type { AttendanceStatus } from '@nemis-desktop/types';

export interface AttendanceRecordedEvent extends DomainEvent {
  readonly name: 'AttendanceRecorded';
  readonly studentId: string;
  readonly date: string;
  readonly status: AttendanceStatus;
}

export interface AttendanceCorrectedEvent extends DomainEvent {
  readonly name: 'AttendanceCorrected';
  readonly reason: string;
}
