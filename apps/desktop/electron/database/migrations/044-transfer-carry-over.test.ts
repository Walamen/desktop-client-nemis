import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrations } from './registry';

type Col = { name: string; type: string; notnull: number; dflt_value: string | null };

function insert(db: SqliteDatabase, table: string, values: Record<string, unknown>): void {
  const cols = db.pragma(`table_info("${table}")`) as Col[];
  const row: Record<string, unknown> = { ...values };
  for (const c of cols) {
    if (c.name in row || c.notnull === 0 || c.dflt_value !== null) continue;
    row[c.name] = /INT|REAL|NUM/i.test(c.type) ? 1 : 'x';
  }
  const names = Object.keys(row);
  db.prepare(
    `INSERT INTO "${table}" (${names.map((n) => `"${n}"`).join(',')}) VALUES (${names.map(() => '?').join(',')})`,
  ).run(...Object.values(row));
}

function inPull(db: SqliteDatabase, fn: () => void): void {
  db.transaction(() => {
    db.prepare(`UPDATE sync_runtime SET captureEnabled = 0 WHERE id = 'singleton'`).run();
    try {
      fn();
    } finally {
      db.prepare(`UPDATE sync_runtime SET captureEnabled = 1 WHERE id = 'singleton'`).run();
    }
  })();
}

const queued = (db: SqliteDatabase) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM sync_queue`).get() as { n: number }).n;

describe('migration 044 transfer-carry-over', () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    for (const m of migrations) m.up(db);
    inPull(db, () => {
      insert(db, 'academic_years', { id: 'y1', code: 'y1', status: 'ACTIVE' });
      insert(db, 'classes', { id: 'c1', academicYearId: 'y1' });
      // p1 ends before the child joined (2025-10-20); p2 after.
      insert(db, 'grading_periods', {
        id: 'p1', academicYearId: 'y1', termId: 't1', startDate: '2025-09-01T00:00:00.000Z', endDate: '2025-10-15T00:00:00.000Z',
      });
      insert(db, 'grading_periods', {
        id: 'p2', academicYearId: 'y1', termId: 't1', startDate: '2025-10-16T00:00:00.000Z', endDate: '2025-11-30T00:00:00.000Z',
      });
    });
  });

  const carryOver = (status: 'PENDING' | 'SAVED') =>
    inPull(db, () =>
      insert(db, 'transfer_carry_overs', {
        id: 'co1', studentId: 's1', institutionId: 'i1', academicYearId: 'y1',
        fromInstitutionName: 'Alpha School', enrolledAt: '2025-10-20T00:00:00.000Z', status,
      }),
    );
  const carriedCell = () =>
    inPull(db, () =>
      insert(db, 'carried_grades', {
        id: 'g1', carryOverId: 'co1', studentId: 's1', sourceSchoolName: 'Alpha School',
        targetSubjectId: 'sub1', targetGradingPeriodId: 'p2', percentage: 72,
      }),
    );
  const grade = (id: string, gradingPeriodId: string, subjectId = 'sub1') =>
    insert(db, 'grades', { id, studentId: 's1', subjectId, classId: 'c1', gradingPeriodId });

  it('is registered as version 44', () => {
    expect(migrations.find((m) => m.version === 44)?.name).toBe('transfer-carry-over');
  });

  it('refuses a local grade in a carried cell and queues nothing', () => {
    carryOver('SAVED');
    carriedCell();
    const before = queued(db);
    expect(() => grade('gr1', 'p2')).toThrow(/TRANSFER_CARRIED_CELL/);
    expect(queued(db)).toBe(before);
  });

  it('accepts another subject in a carried period', () => {
    carryOver('SAVED');
    carriedCell();
    expect(() => grade('gr1', 'p2', 'sub2')).not.toThrow();
  });

  it('while matching is pending, refuses a period that ended before the child joined', () => {
    carryOver('PENDING');
    expect(() => grade('gr1', 'p1')).toThrow(/TRANSFER_MATCH_PENDING/);
    expect(() => grade('gr2', 'p2')).not.toThrow();
  });

  it('refuses moving an existing grade into a carried cell', () => {
    grade('gr1', 'p1', 'sub1');
    carryOver('SAVED');
    carriedCell();
    expect(() => db.prepare(`UPDATE grades SET gradingPeriodId = 'p2' WHERE id = 'gr1'`).run()).toThrow(
      /TRANSFER_CARRIED_CELL/,
    );
  });

  it('lets pulls write carried cells', () => {
    carryOver('SAVED');
    carriedCell();
    inPull(db, () => grade('gr1', 'p2'));
    expect((db.prepare(`SELECT COUNT(*) AS n FROM grades`).get() as { n: number }).n).toBe(1);
  });
});
