import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County Parents & Guardians pages (docs/superpowers/specs/2026-10-18-county-parents-design.md §5.1):
 * each guardian's photo, from their linked login. Pull-only: the guardians
 * outbox triggers are deliberately NOT regenerated, so school devices never
 * push it back (their column lists were fixed when the triggers were
 * installed). A full resync is forced so devices in the field receive it now.
 * Also indexes student_guardians by guardianId: the County list runs several
 * per-guardian subqueries, which otherwise scan every link (quadratic, and it
 * blocks the main process). An index does not touch the outbox triggers. */
export const addGuardianPhoto: Migration = {
  version: 36,
  name: 'add-guardian-photo',
  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE guardians ADD COLUMN photoUrl TEXT;
      CREATE INDEX IF NOT EXISTS idx_student_guardians_guardian ON student_guardians (guardianId);
    `);
    // Same as migration 029: a null lastFullResyncAt makes the next sync cycle a full resync.
    const cols = db.prepare(`PRAGMA table_info("sync_metadata")`).all() as { name: string }[];
    if (cols.some((c) => c.name === 'lastFullResyncAt')) {
      db.exec(`UPDATE sync_metadata SET lastFullResyncAt = NULL`);
    }
  },
};
