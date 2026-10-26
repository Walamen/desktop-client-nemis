import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

type ColumnInfo = { name: string };

describe('migration 042 create-report-cards', () => {
  it('creates the pull-only report card tables with their indexes and no outbox triggers', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    for (const m of migrations.filter((x) => x.version <= 41)) m.up(db);
    expect(migrations.find((m) => m.version === 42)?.name).toBe('create-report-cards');
    migrations.find((m) => m.version === 42)!.up(db);

    expect((db.pragma('table_info(report_cards)') as ColumnInfo[]).map((c) => c.name)).toEqual([
      'id', 'studentId', 'institutionId', 'academicYearId', 'classId', 'gradeLevel', 'createdAt', 'updatedAt',
    ]);
    expect((db.pragma('table_info(report_card_issues)') as ColumnInfo[]).map((c) => c.name)).toEqual([
      'id', 'reportCardId', 'kind', 'gradingPeriodId', 'version', 'status', 'payload', 'issuedBy', 'issuedAt',
      'supersededAt', 'withdrawnAt', 'createdAt', 'updatedAt',
    ]);
    const names = (table: string, type: string) =>
      (db.prepare(`SELECT name FROM sqlite_master WHERE type=? AND tbl_name=?`).all(type, table) as { name: string }[])
        .map((r) => r.name);
    expect(names('report_cards', 'index')).toEqual(
      expect.arrayContaining([
        'idx_report_cards_studentId', 'idx_report_cards_classId', 'idx_report_cards_academicYearId',
      ]),
    );
    expect(names('report_card_issues', 'index')).toContain('idx_report_card_issues_card_status');
    const triggers = db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger'`).all() as { name: string }[];
    expect(triggers.filter((t) => /report_card/.test(t.name))).toEqual([]);
  });
});
