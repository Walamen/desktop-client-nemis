import { describe, expect, it } from 'vitest';
import { Attendance } from '@nemis-desktop/domain';
import { AttendanceStatus } from '@nemis-desktop/types';
import { InMemoryAttendanceRepository } from './in-memory-attendance-repository';

function record(id: string, overrides: Partial<{ subjectId: string; date: string }> = {}): Attendance {
  return Attendance.record({
    id,
    studentId: 'stu-1',
    classId: 'cls-1',
    subjectId: overrides.subjectId,
    date: overrides.date ?? '2026-08-06',
    status: AttendanceStatus.PRESENT,
    occurredAt: '2026-08-06T08:00:00.000Z',
  });
}

describe('InMemoryAttendanceRepository.findExistingId', () => {
  it('returns undefined when no row exists for the natural key', () => {
    const repo = new InMemoryAttendanceRepository();
    expect(repo.findExistingId('stu-1', 'subj-1', '2026-08-06')).toBeUndefined();
  });

  it('returns the id of the existing row for (studentId, subjectId, date)', () => {
    const repo = new InMemoryAttendanceRepository();
    repo.save(record('att-1', { subjectId: 'subj-1' }));
    expect(repo.findExistingId('stu-1', 'subj-1', '2026-08-06')).toBe('att-1');
  });

  it('treats subjectId undefined as its own natural key, distinct from a real subjectId', () => {
    const repo = new InMemoryAttendanceRepository();
    repo.save(record('att-1', { subjectId: 'subj-1' }));
    expect(repo.findExistingId('stu-1', undefined, '2026-08-06')).toBeUndefined();
  });
});
