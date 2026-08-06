import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Tracking columns for the dedicated assignment push-sync path (see
 * BackendProvisioningGateway.createAssignment/updateAssignment/
 * gradeSubmission and AssignmentSyncService). Not part of the generic
 * outbox mechanism (migration 019 dropped those triggers for this table),
 * so this vertical needs its own minimal "is this row pushed yet" state:
 *
 *   remoteId  — the id the backend assigned on first successful push (the
 *               backend generates its own uuid; it never accepts a
 *               client-supplied id). NULL until pushed at least once.
 *   syncedAt  — timestamp of the last successful push. A row is "dirty" and
 *               due for push when syncedAt IS NULL or updatedAt > syncedAt.
 *
 * assignment_submissions doesn't need remoteId — grades push through the
 * owning assignment's remoteId, and the studentId in the URL is already the
 * server's own id (students are pulled down, never created locally). */
export const addAssignmentSyncTracking: Migration = {
  version: 20,
  name: 'add-assignment-sync-tracking',
  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE assignments ADD COLUMN remoteId TEXT;
      ALTER TABLE assignments ADD COLUMN syncedAt TEXT;
      ALTER TABLE assignment_submissions ADD COLUMN syncedAt TEXT;
      CREATE INDEX idx_assignments_syncedAt ON assignments (syncedAt);
      CREATE INDEX idx_assignment_submissions_syncedAt ON assignment_submissions (syncedAt);
    `);
  },
};
