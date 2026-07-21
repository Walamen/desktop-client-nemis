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
});
