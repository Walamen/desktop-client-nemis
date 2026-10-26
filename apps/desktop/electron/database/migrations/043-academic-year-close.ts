import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';
import {
  installTableFreezeTriggers,
  installYearRowTriggers,
  RESOLVERS,
  YEAR_OF_CLASS,
} from './040-create-academic-year-freeze';

/**
 * Academic-year lifecycle, Stage 3 (close / reopen).
 *
 * 1. A REOPENED year is frozen to user writes exactly like a CLOSED one: the
 *    server only lets corrections through its dedicated bypass path, so the
 *    device must not queue edits either. Every freeze trigger is regenerated
 *    with CLOSED and REOPENED refused (pulls, captureEnabled = 0, still land).
 * 2. grades.enteredAtClose, report_cards.principalRemark and
 *    grade_completions.overrideReason: server-written, pulled.
 * 3. academic_year_archives: pull-only (no outbox, no freeze triggers).
 */
export const academicYearClose: Migration = {
  version: 43,
  name: 'academic-year-close',
  up(db: SqliteDatabase): void {
    const old = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'freeze\\_%' ESCAPE '\\'`)
      .all() as { name: string }[];
    for (const { name } of old) db.exec(`DROP TRIGGER IF EXISTS "${name}"`);

    const frozen = ['CLOSED', 'REOPENED'] as const;
    for (const [table, resolve] of Object.entries(RESOLVERS)) {
      // 041: enrolments are also checked through their class's year.
      const resolvers = table === 'enrollments' ? [resolve, YEAR_OF_CLASS] : [resolve];
      installTableFreezeTriggers(db, table, resolvers, frozen);
    }
    installYearRowTriggers(db, frozen);

    db.exec(`
      ALTER TABLE grades ADD COLUMN enteredAtClose INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE report_cards ADD COLUMN principalRemark TEXT;
      ALTER TABLE grade_completions ADD COLUMN overrideReason TEXT;
      CREATE TABLE academic_year_archives (
        id TEXT PRIMARY KEY,
        academicYearId TEXT NOT NULL,
        institutionId TEXT NOT NULL,
        version INTEGER NOT NULL,
        closedBy TEXT,
        closedAt TEXT,
        summary TEXT,
        reopenedBy TEXT,
        reopenedAt TEXT,
        reopenReason TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );
      CREATE INDEX idx_academic_year_archives_year ON academic_year_archives (academicYearId);
    `);

    // Same as migrations 029/039/042: a null lastFullResyncAt forces a full resync.
    const cols = db.prepare(`PRAGMA table_info("sync_metadata")`).all() as { name: string }[];
    if (cols.some((c) => c.name === 'lastFullResyncAt')) {
      db.exec(`UPDATE sync_metadata SET lastFullResyncAt = NULL`);
    }
  },
};
