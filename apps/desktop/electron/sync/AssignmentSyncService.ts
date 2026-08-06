import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import { AttachmentStorage } from '@app/services/AttachmentStorage';
import { logger } from '@app/services/logger';

interface AssignmentRow {
  id: string;
  remoteId: string | null;
  classId: string;
  subjectId: string | null;
  title: string;
  type: string;
  status: string;
  instructions: string | null;
  dueDate: string;
  totalMarks: number | null;
  attachmentUrl: string | null;
}

interface SubmissionRow {
  id: string;
  studentId: string;
  grade: number;
  feedback: string | null;
  assignmentRemoteId: string;
}

/** Pushes locally-dirty assignments and grades to the backend through the
 * dedicated REST path (BackendProvisioningGateway's createAssignment /
 * updateAssignment / gradeSubmission) rather than the generic sync_queue —
 * that entity type was deliberately taken out of the generic outbox
 * (migration 019's doc comment explains why: no backend support there, and
 * it can't carry a file). A row failing here just stays dirty for the next
 * cycle; there's no backoff schedule or dead-lettering — this path is
 * already a simplified, bespoke one, not the generic queue's machinery. */
export class AssignmentSyncService {
  constructor(private readonly gateway: BackendProvisioningGateway) {}

  async pushPending(db: SqliteDatabase): Promise<void> {
    const assignments = db
      .prepare(
        `SELECT id, remoteId, classId, subjectId, title, type, status, instructions, dueDate, totalMarks, attachmentUrl
         FROM assignments WHERE syncedAt IS NULL OR updatedAt > syncedAt`,
      )
      .all() as AssignmentRow[];
    for (const row of assignments) {
      try {
        await this.pushAssignment(db, row);
      } catch (error) {
        logger.error(`AssignmentSyncService: failed to push assignment ${row.id}`, error);
      }
    }

    // Grades can only push once their assignment has a remoteId — an
    // assignment failing above simply defers its grades to the next cycle.
    const submissions = db
      .prepare(
        `SELECT s.id, s.studentId, s.grade, s.feedback, a.remoteId AS assignmentRemoteId
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignmentId
         WHERE s.grade IS NOT NULL
           AND (s.syncedAt IS NULL OR s.updatedAt > s.syncedAt)
           AND a.remoteId IS NOT NULL`,
      )
      .all() as SubmissionRow[];
    for (const row of submissions) {
      try {
        await this.pushSubmission(db, row);
      } catch (error) {
        logger.error(`AssignmentSyncService: failed to push grade for submission ${row.id}`, error);
      }
    }
  }

  private async pushAssignment(db: SqliteDatabase, row: AssignmentRow): Promise<void> {
    const filePath = AttachmentStorage.localPath(row.attachmentUrl);
    const fields: Record<string, string> = {
      title: row.title,
      type: row.type,
      status: row.status,
      dueDate: row.dueDate,
    };
    if (row.subjectId) fields.subjectId = row.subjectId;
    if (row.instructions) fields.instructions = row.instructions;
    if (row.totalMarks != null) fields.totalMarks = String(row.totalMarks);

    // UpdateAssignmentDto has no classId field on the backend (it never
    // changes after creation) — only include it on the first, create push.
    const isFirstPush = row.remoteId === null;
    const result =
      row.remoteId === null
        ? await this.gateway.createAssignment({ ...fields, classId: row.classId }, filePath)
        : await this.gateway.updateAssignment(row.remoteId, fields, filePath);

    const now = new Date().toISOString();
    if (isFirstPush) {
      // The backend mints its own id for a new assignment — it never accepts
      // a client-supplied one (see migration 020's doc comment). Canonicalize
      // this row's local primary key to that server id now. Without this,
      // the next snapshot pull would insert a *second* row for this
      // assignment under the server id — see this file's class-level doc
      // comment and ProvisioningImporter's plain upsert-by-id merge.
      //
      // A teacher can grade a synthesized "PENDING" row before this
      // assignment has ever been pushed (see GradeSubmissionUseCase), which
      // inserts a local assignment_submissions row keyed on the *local*
      // assignment id. The cascade below re-points that row at the new
      // canonical id so the rewrite doesn't orphan it.
      const canonicalize = db.transaction((oldId: string, newId: string) => {
        db.prepare(
          `UPDATE assignments
           SET id = ?, remoteId = ?, attachmentUrl = COALESCE(?, attachmentUrl), attachmentName = COALESCE(?, attachmentName), syncedAt = ?
           WHERE id = ?`,
        ).run(newId, newId, result.attachmentUrl ?? null, result.attachmentName ?? null, now, oldId);
        // UPDATE OR IGNORE guards the (assignmentId,studentId) unique
        // constraint in the extremely unlikely event a row already exists
        // under the new id.
        db.prepare(
          `UPDATE OR IGNORE assignment_submissions SET assignmentId = ? WHERE assignmentId = ?`,
        ).run(newId, oldId);
      });
      canonicalize(row.id, result.id);
    } else {
      db.prepare(
        `UPDATE assignments
         SET attachmentUrl = COALESCE(?, attachmentUrl), attachmentName = COALESCE(?, attachmentName), syncedAt = ?
         WHERE id = ?`,
      ).run(result.attachmentUrl ?? null, result.attachmentName ?? null, now, row.id);
    }
  }

  private async pushSubmission(db: SqliteDatabase, row: SubmissionRow): Promise<void> {
    await this.gateway.gradeSubmission(row.assignmentRemoteId, row.studentId, {
      grade: row.grade,
      feedback: row.feedback ?? undefined,
    });
    db.prepare(`UPDATE assignment_submissions SET syncedAt = ? WHERE id = ?`).run(
      new Date().toISOString(),
      row.id,
    );
  }
}
