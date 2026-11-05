import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { RESOLVERS } from './040-create-academic-year-freeze';
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

const T = 'grade_entry_window_classes';

describe('migration 045 drop-grade-entry-window-classes', () => {
  it('drops the table and its triggers, keeps grade_entry_windows', () => {
    const db: SqliteDatabase = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    for (const m of migrations.filter((x) => x.version <= 44)) m.up(db);

    db.transaction(() => {
      db.prepare(`UPDATE sync_runtime SET captureEnabled = 0 WHERE id = 'singleton'`).run();
      insert(db, 'academic_years', { id: 'y1', code: 'y1', status: 'ACTIVE' });
      insert(db, 'grading_periods', { id: 'gp1', academicYearId: 'y1' });
      insert(db, 'grade_entry_windows', { id: 'w1', gradingPeriodId: 'gp1' });
      insert(db, T, { id: 'wc1', windowId: 'w1', classId: 'c1' });
      db.prepare(`UPDATE sync_runtime SET captureEnabled = 1 WHERE id = 'singleton'`).run();
    })();

    const m45 = migrations.find((x) => x.version === 45);
    expect(m45?.name).toBe('drop-grade-entry-window-classes');
    m45!.up(db);

    const objs = db
      .prepare(`SELECT name, type, sql FROM sqlite_master WHERE name LIKE ? OR sql LIKE ?`)
      .all(`%${T}%`, `%${T}%`);
    expect(objs).toEqual([]);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM grade_entry_windows`).get()).toEqual({ n: 1 });
  });

  it('later RESOLVERS loops skip the dropped table', () => {
    expect(Object.keys(RESOLVERS)).not.toContain(T);
  });
});
