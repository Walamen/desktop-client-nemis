import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Attendance } from '@nemis-desktop/domain';
import { AttendanceStatus } from '@nemis-desktop/types';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteAttendanceRepository } from './SqliteAttendanceRepository';

function record(id: string, status: AttendanceStatus, date = '2026-07-20'): Attendance {
  return Attendance.record({
    id, studentId: `stu-${id}`, classId: 'c-1', date, status,
    occurredAt: `${date}T08:00:00.000Z`,
  });
}

describe('SqliteAttendanceRepository', () => {
  let test: TestContext;
  let repo: SqliteAttendanceRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteAttendanceRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('countByDate is present:0,total:0 on an empty table', () => {
    expect(repo.countByDate('2026-07-20')).toEqual({ present: 0, total: 0 });
  });

  it('save persists rows and countByDate counts present vs total for the date', () => {
    repo.save(record('1', AttendanceStatus.PRESENT));
    repo.save(record('2', AttendanceStatus.ABSENT));
    repo.save(record('3', AttendanceStatus.PRESENT, '2026-07-19'));
    expect(repo.countByDate('2026-07-20')).toEqual({ present: 1, total: 2 });
    expect(repo.countByDate('2026-07-19')).toEqual({ present: 1, total: 1 });
  });

  it('findByClassAndDate returns the rows for that class and date', () => {
    repo.save(record('1', AttendanceStatus.PRESENT));
    repo.save(record('2', AttendanceStatus.LATE));
    const rows = repo.findByClassAndDate('c-1', '2026-07-20');
    expect(rows).toHaveLength(2);
    expect(rows.every((a) => a.classId === 'c-1' && a.date === '2026-07-20')).toBe(true);
  });

  it('persists subjectId, recordedBy, remarks and updateReason', () => {
    const attendance = Attendance.record({
      id: 'att-sub', studentId: 'stu-sub', classId: 'c-1', subjectId: 'subj-1',
      date: '2026-07-20', status: AttendanceStatus.LATE, recordedBy: 'teacher-1',
      remarks: 'Bus was late', updateReason: 'Correcting register mix-up',
      occurredAt: '2026-07-20T08:00:00.000Z',
    });
    repo.save(attendance);
    const [row] = repo.findByClassAndDate('c-1', '2026-07-20', 'subj-1');
    expect(row?.subjectId).toBe('subj-1');
    expect(row?.recordedBy).toBe('teacher-1');
    expect(row?.remarks).toBe('Bus was late');
    expect(row?.updateReason).toBe('Correcting register mix-up');
  });

  it('findByClassAndDate with a subjectId only returns that subject\'s rows', () => {
    repo.save(
      Attendance.record({
        id: 'att-a', studentId: 'stu-1', classId: 'c-1', subjectId: 'subj-1',
        date: '2026-07-20', status: AttendanceStatus.PRESENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    repo.save(
      Attendance.record({
        id: 'att-b', studentId: 'stu-1', classId: 'c-1', subjectId: 'subj-2',
        date: '2026-07-20', status: AttendanceStatus.ABSENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    const rows = repo.findByClassAndDate('c-1', '2026-07-20', 'subj-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe(AttendanceStatus.PRESENT);
  });

  it('save upserts by (studentId, subjectId, date) rather than duplicating rows', () => {
    repo.save(
      Attendance.record({
        id: 'att-1', studentId: 'stu-1', classId: 'c-1', subjectId: 'subj-1',
        date: '2026-07-20', status: AttendanceStatus.PRESENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    repo.save(
      Attendance.record({
        id: 'att-2', studentId: 'stu-1', classId: 'c-1', subjectId: 'subj-1',
        date: '2026-07-20', status: AttendanceStatus.ABSENT, occurredAt: '2026-07-20T09:00:00.000Z',
      }),
    );
    const rows = repo.findByClassAndDate('c-1', '2026-07-20', 'subj-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe(AttendanceStatus.ABSENT);
  });

  it('findExistingId returns undefined when no row exists for the natural key', () => {
    expect(repo.findExistingId('stu-1', 'subj-1', '2026-07-20')).toBeUndefined();
  });

  it('findExistingId returns the id of the current row for (studentId, subjectId, date)', () => {
    repo.save(
      Attendance.record({
        id: 'att-1', studentId: 'stu-1', classId: 'c-1', subjectId: 'subj-1',
        date: '2026-07-20', status: AttendanceStatus.PRESENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    expect(repo.findExistingId('stu-1', 'subj-1', '2026-07-20')).toBe('att-1');
  });

  it('save() edits in place under the same id without deleting the row first', () => {
    repo.save(
      Attendance.record({
        id: 'att-1', studentId: 'stu-1', classId: 'c-1', subjectId: 'subj-1',
        date: '2026-07-20', status: AttendanceStatus.PRESENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    repo.save(
      Attendance.record({
        id: 'att-1', studentId: 'stu-1', classId: 'c-1', subjectId: 'subj-1',
        date: '2026-07-20', status: AttendanceStatus.ABSENT, occurredAt: '2026-07-20T09:00:00.000Z',
      }),
    );
    const rows = repo.findByClassAndDate('c-1', '2026-07-20', 'subj-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('att-1');
    expect(rows[0]?.status).toBe(AttendanceStatus.ABSENT);
  });
});
