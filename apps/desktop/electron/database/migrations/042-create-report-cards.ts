import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Academic-year lifecycle, Stage 2: the report cards a school issued, pulled
 * from the server so views read them offline. Pull-only: no outbox triggers
 * and no freeze triggers (no user ever writes these tables). `payload` is the
 * ReportCardPayloadV1 JSON of the issue. A full resync is forced so devices
 * receive existing cards now. */
export const createReportCards: Migration = {
  version: 42,
  name: 'create-report-cards',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE report_cards (
        id TEXT PRIMARY KEY,
        studentId TEXT NOT NULL,
        institutionId TEXT NOT NULL,
        academicYearId TEXT NOT NULL,
        classId TEXT NOT NULL,
        gradeLevel TEXT NOT NULL,
        createdAt TEXT,
        updatedAt TEXT
      );
      CREATE INDEX idx_report_cards_studentId ON report_cards (studentId);
      CREATE INDEX idx_report_cards_classId ON report_cards (classId);
      CREATE INDEX idx_report_cards_academicYearId ON report_cards (academicYearId);
      CREATE TABLE report_card_issues (
        id TEXT PRIMARY KEY,
        reportCardId TEXT NOT NULL,
        kind TEXT NOT NULL,
        gradingPeriodId TEXT,
        version INTEGER NOT NULL,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        issuedBy TEXT,
        issuedAt TEXT NOT NULL,
        supersededAt TEXT,
        withdrawnAt TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );
      CREATE INDEX idx_report_card_issues_card_status ON report_card_issues (reportCardId, status);
    `);
    // Same as migrations 029/039: a null lastFullResyncAt makes the next sync cycle a full resync.
    const cols = db.prepare(`PRAGMA table_info("sync_metadata")`).all() as { name: string }[];
    if (cols.some((c) => c.name === 'lastFullResyncAt')) {
      db.exec(`UPDATE sync_metadata SET lastFullResyncAt = NULL`);
    }
  },
};
