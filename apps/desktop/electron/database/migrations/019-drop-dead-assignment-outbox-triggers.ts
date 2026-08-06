import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Migration 012 pre-installed generic JSON outbox triggers on `assignments`
 * and `assignment_submissions` (scaffolding ahead of any real feature). The
 * backend's desktop-sync-applier has no case for either entity type, and its
 * per-role allowlist doesn't grant TEACHER write access to them either — so
 * every row these triggers ever produced would sit in `sync_queue` forever,
 * or be rejected outright. No UI has ever written through them (the only
 * consumer was the generic SchoolAdminCollectionPage viewer, which is
 * read-only for this collection), so there is no data at risk.
 *
 * The teacher-assignments feature reaches the backend through a dedicated,
 * purpose-built push path instead (direct authenticated REST calls to the
 * same /teacher/assignments endpoints portal-web already uses — see the
 * assignment sync service), because that generic JSON mechanism structurally
 * cannot carry the file attachment these records need. Reads still arrive
 * normally via the existing snapshot/delta pull (ProvisioningImporter) —
 * only the generic *push* triggers are dead weight here. `class_resources`
 * is a separate, unrelated feature and keeps its triggers. */
export const dropDeadAssignmentOutboxTriggers: Migration = {
  version: 19,
  name: 'drop-dead-assignment-outbox-triggers',
  up(db: SqliteDatabase): void {
    db.exec(`
      DROP TRIGGER IF EXISTS outbox_assignments_insert;
      DROP TRIGGER IF EXISTS outbox_assignments_update;
      DROP TRIGGER IF EXISTS outbox_assignments_delete;
      DROP TRIGGER IF EXISTS outbox_assignment_submissions_insert;
      DROP TRIGGER IF EXISTS outbox_assignment_submissions_update;
      DROP TRIGGER IF EXISTS outbox_assignment_submissions_delete;
    `);
  },
};
