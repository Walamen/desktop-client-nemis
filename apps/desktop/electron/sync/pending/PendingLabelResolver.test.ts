import { describe, expect, it, vi } from 'vitest';
import { logger } from '@app/services/logger';
import { PENDING_LABEL_TYPES, PendingLabelResolver } from './PendingLabelResolver';
import type { RawPendingRow } from './types';
import { PAST, memoryDb, seedClass, seedGradeCompletion, seedStudent, seedSubject } from './pending.test-support';

function raw(entityType: string, entityId: string, payload: unknown = null): RawPendingRow {
  return { id: `q-${entityId}`, entityType, entityId, operationType: 'create', state: 'waiting', createdAt: PAST, nextAttemptAt: null, retryCount: 0, lastError: null, payload };
}

function seedAttendance(db: ReturnType<typeof memoryDb>, id: string, studentId: string, subjectId: string | null) {
  db.prepare(
    `INSERT INTO attendance (id,studentId,classId,subjectId,date,status,version,updatedAt) VALUES (?,?,'c1',?,'2026-10-14','PRESENT',1,?)`,
  ).run(id, studentId, subjectId, PAST);
}

describe('PendingLabelResolver', () => {
  const resolver = new PendingLabelResolver();

  it('names students, enrolments and attendance from local tables', () => {
    const db = memoryDb();
    seedStudent(db, 's1', 'Musu', 'Kollie', '123456789012');
    seedClass(db, 'c1', 'Grade 5A');
    seedSubject(db, 'sub1', 'Mathematics');
    seedAttendance(db, 'att1', 's1', 'sub1');
    seedAttendance(db, 'att2', 's1', null);
    db.prepare(
      `INSERT INTO enrollments (id,studentId,classId,academicYearId,termId,enrollmentDate,status,version,updatedAt) VALUES ('en1','s1','c1','y1','t1','2026-09-01','ACTIVE',1,?)`,
    ).run(PAST);

    const labels = resolver.resolve(db, [raw('students', 's1'), raw('attendance', 'att1'), raw('attendance', 'att2'), raw('enrollments', 'en1')]).map((r) => r.label);
    expect(labels).toEqual([
      'Musu Kollie · 123456789012',
      'Musu Kollie · Grade 5A · Mathematics · 2026-10-14',
      'Musu Kollie · Grade 5A · 2026-10-14',
      'Musu Kollie · Grade 5A',
    ]);
  });

  it('falls back to the payload when the row is gone (e.g. a delete)', () => {
    const db = memoryDb();
    const [record] = resolver.resolve(db, [raw('students', 'gone', { base: { firstName: 'Ada', lastName: 'Lovelace' } })]);
    expect(record?.label).toBe('Ada Lovelace');
  });

  it('falls back to type and short id for an unknown entity type', () => {
    const [record] = resolver.resolve(memoryDb(), [raw('widgets', 'abcdef123456')]);
    expect(record?.label).toBe('Widgets · abcdef12…');
  });

  it('runs one lookup per entity type, not one per row', () => {
    const db = memoryDb();
    seedStudent(db, 's1', 'Musu', 'Kollie');
    seedStudent(db, 's2', 'Ama', 'Doe');
    seedClass(db, 'c1', 'Grade 5A');
    seedAttendance(db, 'a1', 's1', null);
    seedAttendance(db, 'a2', 's2', null);
    seedAttendance(db, 'a3', 's1', null);
    const prepare = vi.spyOn(db, 'prepare');
    resolver.resolve(db, [raw('students', 's1'), raw('students', 's2'), raw('attendance', 'a1'), raw('attendance', 'a2'), raw('attendance', 'a3')]);
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('humanises grade level and outcome for grade completions', () => {
    const db = memoryDb();
    seedStudent(db, 's1', 'Musu', 'Kollie');
    seedGradeCompletion(db, 'gc1', { studentId: 's1' });
    const [record] = resolver.resolve(db, [raw('grade_completions', 'gc1')]);
    expect(record?.label).toBe('Musu Kollie · Grade 7 · Promoted');
  });

  it('does not treat inherited object keys as entity types', () => {
    const [record] = resolver.resolve(memoryDb(), [raw('constructor', 'abcdef123456')]);
    expect(record?.label).toBe('Constructor · abcdef12…');
  });

  it('every lookup runs against the real schema without a warning', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      const db = memoryDb();
      for (const type of PENDING_LABEL_TYPES) resolver.resolve(db, [raw(type, 'dummy-id')]);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
