import { AggregateRoot } from '../../core';
import { InvalidStateException } from '../../exceptions';
import type { AttendanceStatus } from '@nemis-desktop/types';
import type {
  AttendanceCorrectedEvent,
  AttendanceRecordedEvent,
} from '../events/attendance-events';

interface AttendanceState {
  studentId: string;
  classId: string;
  subjectId?: string;
  date: string;
  status: AttendanceStatus;
  recordedBy?: string;
  remarks?: string;
  /** Audit note captured when a teacher edits an already-recorded, non-today
   * date — see RecordAttendanceUseCase. */
  updateReason?: string;
}

export interface RecordAttendanceInput {
  id: string;
  studentId: string;
  classId: string;
  subjectId?: string;
  date: string;
  status: AttendanceStatus;
  recordedBy?: string;
  remarks?: string;
  updateReason?: string;
  occurredAt: string;
}

export class Attendance extends AggregateRoot<string> {
  #state: AttendanceState;

  private constructor(
    id: string,
    state: AttendanceState,
    metadata: { version: number; updatedAt: string; lastModifiedBy?: string },
  ) {
    super(id, metadata);
    this.#state = state;
  }

  static record(input: RecordAttendanceInput): Attendance {
    const attendance = new Attendance(
      input.id,
      {
        studentId: input.studentId,
        classId: input.classId,
        subjectId: input.subjectId,
        date: input.date,
        status: input.status,
        recordedBy: input.recordedBy,
        remarks: input.remarks,
        updateReason: input.updateReason,
      },
      { version: 1, updatedAt: input.occurredAt, lastModifiedBy: input.recordedBy },
    );
    const event: AttendanceRecordedEvent = {
      name: 'AttendanceRecorded',
      aggregateId: attendance.id,
      occurredAt: input.occurredAt,
      studentId: input.studentId,
      date: input.date,
      status: input.status,
    };
    attendance.addEvent(event);
    return attendance;
  }

  get studentId(): string {
    return this.#state.studentId;
  }
  get classId(): string {
    return this.#state.classId;
  }
  get subjectId(): string | undefined {
    return this.#state.subjectId;
  }
  get date(): string {
    return this.#state.date;
  }
  get status(): AttendanceStatus {
    return this.#state.status;
  }
  get recordedBy(): string | undefined {
    return this.#state.recordedBy;
  }
  get remarks(): string | undefined {
    return this.#state.remarks;
  }
  get updateReason(): string | undefined {
    return this.#state.updateReason;
  }

  correct(status: AttendanceStatus, reason: string, by: string, at: string): void {
    if (reason.trim().length === 0) {
      throw new InvalidStateException('Correcting attendance requires a reason');
    }
    this.#state = { ...this.#state, status };
    this.touch(by, at);
    const event: AttendanceCorrectedEvent = {
      name: 'AttendanceCorrected',
      aggregateId: this.id,
      occurredAt: at,
      reason,
    };
    this.addEvent(event);
  }
}
