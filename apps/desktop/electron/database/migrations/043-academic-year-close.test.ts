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

const columnNames = (db: SqliteDatabase, table: string) =>
  (db.pragma(`table_info("${table}")`) as Col[]).map((c) => c.name);

describe('migration 043 academic-year-close', () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    for (const m of migrations) m.up(db);
    inPull(db, () => {
      insert(db, 'academic_years', { id: 'y-re', code: 'yr', status: 'REOPENED' });
      insert(db, 'academic_years', { id: 'y-active', code: 'ya', status: 'ACTIVE' });
      insert(db, 'classes', { id: 'c-re', academicYearId: 'y-re' });
      insert(db, 'classes', { id: 'c-active', academicYearId: 'y-active' });
    });
  });

  it('is registered as version 43', () => {
    expect(migrations.find((m) => m.version === 43)?.name).toBe('academic-year-close');
  });

  it('refuses capture-on writes into a REOPENED year like a CLOSED one', () => {
    expect(() => insert(db, 'attendance', { id: 'a1', classId: 'c-re' })).toThrow(/ACADEMIC_YEAR_CLOSED/);
    expect(() => insert(db, 'classes', { id: 'c-new', name: 'n', academicYearId: 'y-re' })).toThrow(
      /ACADEMIC_YEAR_CLOSED/,
    );
    inPull(db, () => insert(db, 'attendance', { id: 'a2', classId: 'c-re' }));
    expect(() => db.prepare(`DELETE FROM attendance WHERE id = 'a2'`).run()).toThrow(/ACADEMIC_YEAR_CLOSED/);
  });

  it('allows pulls into a REOPENED year', () => {
    inPull(db, () => insert(db, 'attendance', { id: 'a1', classId: 'c-re' }));
    inPull(db, () => db.prepare(`DELETE FROM attendance WHERE id = 'a1'`).run());
    expect(db.prepare(`SELECT COUNT(*) AS n FROM attendance`).get()).toEqual({ n: 0 });
  });

  it('keeps the enrolment class-year guard and the academic_years triggers REOPENED-aware', () => {
    insert(db, 'enrollments', { id: 'e1', classId: 'c-active', academicYearId: 'y-active' });
    expect(() => db.prepare(`UPDATE enrollments SET classId = 'c-re' WHERE id = 'e1'`).run()).toThrow(
      /ACADEMIC_YEAR_CLOSED/,
    );
    expect(() => db.prepare(`UPDATE academic_years SET code = 'z' WHERE id = 'y-re'`).run()).toThrow(
      /ACADEMIC_YEAR_CLOSED/,
    );
    inPull(db, () => db.prepare(`UPDATE academic_years SET status = 'CLOSED' WHERE id = 'y-re'`).run());
    expect(() => insert(db, 'attendance', { id: 'a9', classId: 'c-re' })).toThrow(/ACADEMIC_YEAR_CLOSED/);
  });

  it('still allows user writes in an ACTIVE year', () => {
    expect(() => insert(db, 'attendance', { id: 'a1', classId: 'c-active' })).not.toThrow();
  });

  it('adds the close columns with their defaults', () => {
    expect(columnNames(db, 'report_cards')).toContain('principalRemark');
    expect(columnNames(db, 'grade_completions')).toContain('overrideReason');
    const col = (db.pragma('table_info(grades)') as Col[]).find((c) => c.name === 'enteredAtClose')!;
    expect(col).toMatchObject({ notnull: 1, dflt_value: '0' });
  });

  it('creates the pull-only academic_year_archives table with no outbox triggers', () => {
    expect(columnNames(db, 'academic_year_archives')).toEqual([
      'id', 'academicYearId', 'institutionId', 'version', 'closedBy', 'closedAt', 'summary',
      'reopenedBy', 'reopenedAt', 'reopenReason', 'createdAt', 'updatedAt',
    ]);
    const triggers = db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger'`).all() as { name: string }[];
    expect(triggers.filter((t) => /academic_year_archives/.test(t.name))).toEqual([]);
  });
});
