import { describe, expect, it } from 'vitest';
import { AttendanceStatus } from '@nemis-desktop/types';
import { Attendance } from './entities/attendance';
import { CanRecordAttendance } from './specifications/can-record-attendance';
import { InvalidStateException } from '../exceptions';

const ISO = '2026-07-17T00:00:00.000Z';

function record(): Attendance {
  return Attendance.record({
    id: 'att-1',
    studentId: 'stu-1',
    classId: 'c-1',
    date: '2026-07-17',
    status: AttendanceStatus.PRESENT,
    recordedBy: 'teacher-1',
    occurredAt: ISO,
  });
}

describe('Attendance', () => {
  it('records and emits AttendanceRecorded', () => {
    const attendance = record();
    expect(attendance.status).toBe(AttendanceStatus.PRESENT);
    const events = attendance.pullDomainEvents();
    expect(events[0]?.name).toBe('AttendanceRecorded');
  });

  it('correct changes status, requires a reason, and emits AttendanceCorrected', () => {
    const attendance = record();
    attendance.pullDomainEvents();
    attendance.correct(AttendanceStatus.LATE, 'arrived at 9am', 'teacher-1', ISO);
    expect(attendance.status).toBe(AttendanceStatus.LATE);
    expect(attendance.version).toBe(2);
    expect(attendance.pullDomainEvents()[0]?.name).toBe('AttendanceCorrected');
    expect(() => attendance.correct(AttendanceStatus.ABSENT, '', 'teacher-1', ISO)).toThrow(
      InvalidStateException,
    );
  });
});

describe('CanRecordAttendance', () => {
  it('requires active enrollment, non-future date, and no prior record', () => {
    const spec = new CanRecordAttendance();
    expect(
      spec.isSatisfiedBy({ enrollmentActive: true, dateIsFuture: false, alreadyRecorded: false }),
    ).toBe(true);
    expect(
      spec.isSatisfiedBy({ enrollmentActive: true, dateIsFuture: true, alreadyRecorded: false }),
    ).toBe(false);
    expect(
      spec.isSatisfiedBy({ enrollmentActive: false, dateIsFuture: false, alreadyRecorded: false }),
    ).toBe(false);
  });
});
