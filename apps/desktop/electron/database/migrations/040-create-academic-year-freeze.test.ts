import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrations } from './registry';

type Col = { name: string; type: string; notnull: number; dflt_value: string | null; pk: number };

/** Inserts a row, filling any other NOT NULL column that has no default. */
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

/** What the importer / sync worker do: apply server data with capture off. */
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

const EXEMPT = ['fee_rules', 'fee_obligations', 'fee_payments', 'fee_payment_reversals', 'student_transfers'];
const FROZEN = [
  'grades', 'attendance', 'assignments', 'assignment_submissions', 'term_averages', 'grade_completions',
  'terms', 'classes', 'class_teachers', 'class_subject_teachers', 'class_subjects', 'enrollments',
  'assessment_templates', 'assessments', 'timetable_entries', 'grading_periods', 'grade_entry_windows',
  'grade_entry_window_classes', 'class_resources',
];

describe('migration 040 create-academic-year-freeze', () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    for (const m of migrations) m.up(db);
    inPull(db, () => {
      insert(db, 'academic_years', { id: 'y-closed', code: 'yc', status: 'CLOSED' });
      insert(db, 'academic_years', { id: 'y-setup', code: 'ys', status: 'SETUP' });
      insert(db, 'academic_years', { id: 'y-active', code: 'ya', status: 'ACTIVE' });
      insert(db, 'classes', { id: 'c-closed', academicYearId: 'y-closed' });
      insert(db, 'classes', { id: 'c-setup', academicYearId: 'y-setup' });
      insert(db, 'classes', { id: 'c-active', academicYearId: 'y-active' });
    });
  });

  it('is registered as version 40', () => {
    expect(migrations.find((m) => m.version === 40)?.name).toBe('create-academic-year-freeze');
  });

  it('refuses a user write into a closed year', () => {
    expect(() => insert(db, 'attendance', { id: 'a1', classId: 'c-closed' })).toThrow(/ACADEMIC_YEAR_CLOSED/);
  });

  it('lets a pull write into a closed year', () => {
    inPull(db, () => insert(db, 'attendance', { id: 'a1', classId: 'c-closed' }));
    expect(db.prepare(`SELECT COUNT(*) AS n FROM attendance`).get()).toEqual({ n: 1 });
  });

  it('refuses grades in a SETUP year', () => {
    expect(() => insert(db, 'grades', { id: 'g1', classId: 'c-setup' })).toThrow(/ACADEMIC_YEAR_NOT_STARTED/);
  });

  it('resolves the year of a grade through its grading period first', () => {
    inPull(db, () => insert(db, 'grading_periods', { id: 'gp-closed', academicYearId: 'y-closed' }));
    expect(() => insert(db, 'grades', { id: 'g1', gradingPeriodId: 'gp-closed', classId: 'c-active' })).toThrow(
      /ACADEMIC_YEAR_CLOSED/,
    );
  });

  it('resolves the year of a grade through its assessment when nothing else is set', () => {
    inPull(db, () => insert(db, 'assessments', { id: 'as1', classId: 'c-closed' }));
    expect(() => insert(db, 'grades', { id: 'g1', assessmentId: 'as1' })).toThrow(/ACADEMIC_YEAR_CLOSED/);
  });

  it('allows classes in a SETUP year', () => {
    expect(() => insert(db, 'classes', { id: 'c-new', name: 'brand-new', academicYearId: 'y-setup' })).not.toThrow();
  });

  it('allows teaching writes in an ACTIVE year', () => {
    expect(() => insert(db, 'attendance', { id: 'a1', classId: 'c-active' })).not.toThrow();
  });

  it('refuses setup writes in a closed year', () => {
    expect(() => insert(db, 'classes', { id: 'c-new', name: 'brand-new', academicYearId: 'y-closed' })).toThrow(/ACADEMIC_YEAR_CLOSED/);
  });

  it('refuses a delete from a closed year', () => {
    inPull(db, () => insert(db, 'attendance', { id: 'a1', classId: 'c-closed' }));
    expect(() => db.prepare(`DELETE FROM attendance WHERE id = 'a1'`).run()).toThrow(/ACADEMIC_YEAR_CLOSED/);
  });

  it('refuses moving an enrollment into or out of a closed year', () => {
    insert(db, 'enrollments', { id: 'e1', classId: 'c-active', academicYearId: 'y-active' });
    expect(() =>
      db.prepare(`UPDATE enrollments SET classId='c-closed', academicYearId='y-closed' WHERE id='e1'`).run(),
    ).toThrow(/ACADEMIC_YEAR_CLOSED/);
    inPull(db, () => insert(db, 'enrollments', { id: 'e2', classId: 'c-closed', academicYearId: 'y-closed' }));
    expect(() =>
      db.prepare(`UPDATE enrollments SET classId='c-active', academicYearId='y-active' WHERE id='e2'`).run(),
    ).toThrow(/ACADEMIC_YEAR_CLOSED/);
  });

  it('resolves child tables through their parents', () => {
    inPull(db, () => insert(db, 'grading_periods', { id: 'gp-closed', academicYearId: 'y-closed' }));
    expect(() => insert(db, 'grade_entry_windows', { id: 'w1', gradingPeriodId: 'gp-closed' })).toThrow(/CLOSED/);
    inPull(db, () => insert(db, 'grade_entry_windows', { id: 'w-closed', gradingPeriodId: 'gp-closed' }));
    expect(() =>
      insert(db, 'grade_entry_window_classes', { id: 'wc1', windowId: 'w-closed', classId: 'c-active' }),
    ).toThrow(/CLOSED/);
    inPull(db, () => insert(db, 'assignments', { id: 'as-c', classId: 'c-closed' }));
    expect(() => insert(db, 'assignment_submissions', { id: 's1', assignmentId: 'as-c' })).toThrow(/CLOSED/);
    inPull(db, () => insert(db, 'terms', { id: 't-c', academicYearId: 'y-closed' }));
    expect(() => insert(db, 'term_averages', { id: 'ta1', termId: 't-c' })).toThrow(/CLOSED/);
  });

  it('never freezes fee_obligations', () => {
    expect(() => insert(db, 'fee_obligations', { id: 'f1', academicYearId: 'y-closed' })).not.toThrow();
    expect(() => db.prepare(`UPDATE fee_obligations SET notes = 'n' WHERE id = 'f1'`).run()).not.toThrow();
  });

  it('refuses deleting an ACTIVE or CLOSED academic year, allows a SETUP one', () => {
    expect(() => db.prepare(`DELETE FROM academic_years WHERE id = 'y-active'`).run()).toThrow(
      /ACADEMIC_YEAR_NOT_DELETABLE/,
    );
    expect(() => db.prepare(`DELETE FROM academic_years WHERE id = 'y-closed'`).run()).toThrow(
      /ACADEMIC_YEAR_NOT_DELETABLE/,
    );
    expect(() => db.prepare(`DELETE FROM academic_years WHERE id = 'y-setup'`).run()).not.toThrow();
  });

  it('refuses a user update of a closed academic year but lets a pull change it', () => {
    expect(() => db.prepare(`UPDATE academic_years SET code = 'z' WHERE id = 'y-closed'`).run()).toThrow(
      /ACADEMIC_YEAR_CLOSED/,
    );
    inPull(db, () => db.prepare(`UPDATE academic_years SET status = 'REOPENED' WHERE id = 'y-closed'`).run());
    expect(() => db.prepare(`UPDATE academic_years SET code = 'z' WHERE id = 'y-closed'`).run()).not.toThrow();
  });

  describe('sync bookkeeping writes are never refused (ruling R2)', () => {
    it('grade_completions syncState / syncError on a closed-year row', () => {
      inPull(db, () =>
        insert(db, 'grade_completions', { id: 'gc1', academicYearId: 'y-closed', syncState: 'pending', updatedAt: 'u' }),
      );
      expect(() =>
        db
          .prepare(`UPDATE grade_completions SET syncState=?, syncError=? WHERE id=? AND syncState='pending' AND updatedAt=?`)
          .run('synced', null, 'gc1', 'u'),
      ).not.toThrow();
      expect(db.prepare(`SELECT syncState FROM grade_completions WHERE id='gc1'`).get()).toEqual({ syncState: 'synced' });
      expect(() => db.prepare(`UPDATE grade_completions SET notes='n' WHERE id='gc1'`).run()).toThrow(/CLOSED/);
    });

    it('assignment push bookkeeping (canonicalize id/remoteId/attachment/syncedAt) on a closed-year row', () => {
      inPull(db, () => insert(db, 'assignments', { id: 'a-local', classId: 'c-closed' }));
      inPull(db, () => insert(db, 'assignment_submissions', { id: 'sub1', assignmentId: 'a-local' }));
      db.prepare(
        `UPDATE assignments
         SET id = ?, remoteId = ?, attachmentUrl = COALESCE(?, attachmentUrl), attachmentName = COALESCE(?, attachmentName), syncedAt = ?
         WHERE id = ?`,
      ).run('a-remote', 'a-remote', 'u', 'n', 'now', 'a-local');
      db.prepare(`UPDATE OR IGNORE assignment_submissions SET assignmentId = ? WHERE assignmentId = ?`).run(
        'a-remote',
        'a-local',
      );
      db.prepare(
        `UPDATE assignments SET attachmentUrl = COALESCE(?, attachmentUrl), attachmentName = COALESCE(?, attachmentName), syncedAt = ? WHERE id = ?`,
      ).run('u2', 'n2', 'now2', 'a-remote');
      db.prepare(`UPDATE assignment_submissions SET syncedAt = ? WHERE id = ?`).run('now3', 'sub1');
      expect(db.prepare(`SELECT remoteId, syncedAt FROM assignments WHERE id='a-remote'`).get()).toEqual({
        remoteId: 'a-remote',
        syncedAt: 'now2',
      });
      expect(() => db.prepare(`UPDATE assignments SET title='t' WHERE id='a-remote'`).run()).toThrow(/CLOSED/);
      expect(() => db.prepare(`UPDATE assignment_submissions SET grade=5 WHERE id='sub1'`).run()).toThrow(/CLOSED/);
    });
  });

  it('every year-owned table is frozen or explicitly exempt', () => {
    const tables = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    const triggers = (db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger'`).all() as { name: string }[]).map(
      (t) => t.name,
    );
    const owners = tables.filter((t) =>
      (db.pragma(`table_info("${t}")`) as Col[]).some((c) =>
        ['academicYearId', 'classId', 'termId', 'gradingPeriodId', 'windowId', 'assignmentId'].includes(c.name),
      ),
    );
    for (const t of FROZEN) expect(owners, t).toContain(t);
    for (const t of owners) {
      if (EXEMPT.includes(t)) continue;
      for (const action of ['insert', 'update', 'delete']) {
        expect(triggers, `freeze_${t}_${action}`).toContain(`freeze_${t}_${action}`);
      }
    }
  });
});
