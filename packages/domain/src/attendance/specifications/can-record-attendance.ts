import { Specification } from '../../core';

export interface AttendanceContext {
  enrollmentActive: boolean;
  dateIsFuture: boolean;
  alreadyRecorded: boolean;
}

export class CanRecordAttendance extends Specification<AttendanceContext> {
  isSatisfiedBy(candidate: AttendanceContext): boolean {
    return candidate.enrollmentActive && !candidate.dateIsFuture && !candidate.alreadyRecorded;
  }
}
