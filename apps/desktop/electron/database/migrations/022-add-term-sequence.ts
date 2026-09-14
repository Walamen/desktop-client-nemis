import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import { installOutboxTriggers } from './010-create-sync-outbox';

/** Terms used to be ordered by startDate (user-entered, and wrong or
 * corrected after the fact), which is why a term created later could
 * display ahead of one created earlier. `sequence` is now the explicit,
 * permanent position tag every listing sorts by instead (mirrors
 * grading_periods' existing `sequence` column and the backend's own fix).
 *
 * Each device's local database is small (one school), so unlike the
 * backend's separate backfill script, this runs the backfill inline:
 * existing terms are numbered per academic year by current startDate order
 * (ties broken by updatedAt) right here, so nothing is left unordered after
 * the migration runs. `terms` already has its outbox triggers installed
 * (migration 010), and those were baked from the column list at that time,
 * so they're dropped and reinstalled here to pick up the new column
 * (same pattern as migration 018). */
export const addTermSequence: Migration = {
  version: 22,
  name: 'add-term-sequence',
  up(db: SqliteDatabase): void {
    db.exec(`ALTER TABLE terms ADD COLUMN sequence INTEGER;`);

    const rows = db
      .prepare(`SELECT id, academicYearId FROM terms ORDER BY academicYearId, startDate ASC, updatedAt ASC`)
      .all() as { id: string; academicYearId: string }[];
    const setSequence = db.prepare(`UPDATE terms SET sequence = ? WHERE id = ?`);
    const nextByYear = new Map<string, number>();
    for (const row of rows) {
      const next = nextByYear.get(row.academicYearId) ?? 1;
      setSequence.run(next, row.id);
      nextByYear.set(row.academicYearId, next + 1);
    }

    db.exec(`
      CREATE UNIQUE INDEX idx_terms_year_sequence ON terms (academicYearId, sequence);

      DROP TRIGGER outbox_terms_insert;
      DROP TRIGGER outbox_terms_update;
      DROP TRIGGER outbox_terms_delete;
    `);
    installOutboxTriggers(db, ['terms']);
  },
};
