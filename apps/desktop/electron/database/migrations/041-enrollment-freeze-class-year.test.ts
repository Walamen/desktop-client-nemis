import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrations } from './registry';

type Col = { name: string; type: string; notnull: number; dflt_value: string | null };

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

describe('migration 041 enrollment-freeze-class-year', () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    for (const m of migrations) m.up(db);
    inPull(db, () => {
      insert(db, 'academic_years', { id: 'y-closed', code: 'yc', status: 'CLOSED' });
      insert(db, 'academic_years', { id: 'y-active', code: 'ya', status: 'ACTIVE' });
      insert(db, 'classes', { id: 'c-closed', academicYearId: 'y-closed' });
      insert(db, 'classes', { id: 'c-active', academicYearId: 'y-active' });
      insert(db, 'classes', { id: 'c-active-2', name: 'second', academicYearId: 'y-active' });
    });
    insert(db, 'enrollments', { id: 'e1', classId: 'c-active', academicYearId: 'y-active' });
  });

  it('is registered as version 41', () => {
    expect(migrations.find((m) => m.version === 41)?.name).toBe('enrollment-freeze-class-year');
  });

  it("refuses re-pointing an enrolment's class at a CLOSED-year class (capture on)", () => {
    expect(() =>
      db.prepare(`UPDATE enrollments SET classId = 'c-closed' WHERE id = 'e1'`).run(),
    ).toThrow(/ACADEMIC_YEAR_CLOSED/);
  });

  it('lets the same re-point through with capture off (pull)', () => {
    inPull(db, () =>
      db.prepare(`UPDATE enrollments SET classId = 'c-closed' WHERE id = 'e1'`).run(),
    );
    expect(db.prepare(`SELECT classId FROM enrollments WHERE id = 'e1'`).get()).toEqual({
      classId: 'c-closed',
    });
  });

  it('refuses moving an enrolment out of a CLOSED-year class', () => {
    inPull(db, () =>
      insert(db, 'enrollments', {
        id: 'e2',
        studentId: 's2',
        classId: 'c-closed',
        academicYearId: 'y-active',
      }),
    );
    expect(() =>
      db.prepare(`UPDATE enrollments SET classId = 'c-active' WHERE id = 'e2'`).run(),
    ).toThrow(/ACADEMIC_YEAR_CLOSED/);
  });

  it('refuses inserting an enrolment into a CLOSED-year class', () => {
    expect(() =>
      insert(db, 'enrollments', {
        id: 'e3',
        studentId: 's3',
        classId: 'c-closed',
        academicYearId: 'y-active',
      }),
    ).toThrow(/ACADEMIC_YEAR_CLOSED/);
  });

  it('still allows a class move within an open year', () => {
    expect(() =>
      db.prepare(`UPDATE enrollments SET classId = 'c-active-2' WHERE id = 'e1'`).run(),
    ).not.toThrow();
  });
});
