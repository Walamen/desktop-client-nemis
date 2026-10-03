import type { Database as SqliteDatabase } from 'better-sqlite3';
import { RemoteRejectedError } from '@nemis-desktop/shared';
import type { CompletionDecision, SaveCompletionsRequest } from '@nemis-desktop/types';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import { logger } from '@app/services/logger';

interface PendingRow {
  id: string;
  studentId: string;
  academicYearId: string;
  gradeLevel: SaveCompletionsRequest['gradeLevel'];
  outcome: CompletionDecision['outcome'];
  nextGradeLevel: SaveCompletionsRequest['gradeLevel'] | null;
  notes: string | null;
  updatedAt: string;
}

const FALLBACK_REJECTION = 'The server rejected these decisions.';

/** Pushes the admin's queued end-of-year decisions to the server's grade
 * completion endpoint, deliberately outside the generic sync_queue (see the
 * grade_completions migration). One POST per (academicYearId, gradeLevel):
 * the server stamps a group all-or-nothing, so a 4xx rejects every row of the
 * group, while a network error or 5xx leaves it pending for the next cycle.
 * Never throws — a failure here must not abort the worker cycle. */
export class GradeCompletionSyncService {
  constructor(
    private readonly gateway: Pick<BackendProvisioningGateway, 'recordGradeCompletions'>,
  ) {}

  async pushPending(db: SqliteDatabase, institutionId: string): Promise<void> {
    let groups: Map<string, PendingRow[]>;
    try {
      groups = this.#loadGroups(db, institutionId);
    } catch (error) {
      logger.error('GradeCompletionSyncService: could not read pending decisions', error);
      return;
    }

    for (const rows of groups.values()) {
      const first = rows[0];
      if (!first) continue;
      try {
        // Ordering gate: the server can only stamp students and enrolments it
        // already has. Waits only on rows that can still go through —
        // dead-lettered ones (status 'failed') never self-resolve and would
        // block outcomes forever.
        const blocking = db
          .prepare(
            `SELECT 1 FROM sync_queue
             WHERE entityType IN ('students','enrollments') AND status IN ('pending','in_flight')
             LIMIT 1`,
          )
          .get();
        if (blocking) continue;

        const decisions: CompletionDecision[] = rows.map((row) => ({
          studentId: row.studentId,
          outcome: row.outcome,
          ...(row.nextGradeLevel ? { nextGradeLevel: row.nextGradeLevel } : {}),
          ...(row.notes ? { notes: row.notes } : {}),
        }));
        try {
          await this.gateway.recordGradeCompletions({
            academicYearId: first.academicYearId,
            gradeLevel: first.gradeLevel,
            decisions,
          });
        } catch (error) {
          if (error instanceof RemoteRejectedError) {
            this.#mark(db, rows, 'rejected', error.remoteMessage || FALLBACK_REJECTION);
          } else {
            logger.error(
              `GradeCompletionSyncService: failed to push ${first.academicYearId}/${first.gradeLevel}`,
              error,
            );
          }
          continue;
        }
        this.#mark(db, rows, 'synced', null);
      } catch (error) {
        logger.error(
          `GradeCompletionSyncService: unexpected failure for ${first.academicYearId}/${first.gradeLevel}`,
          error,
        );
      }
    }
  }

  #loadGroups(db: SqliteDatabase, institutionId: string): Map<string, PendingRow[]> {
    const rows = db
      .prepare(
        `SELECT id, studentId, academicYearId, gradeLevel, outcome, nextGradeLevel, notes, updatedAt
         FROM grade_completions
         WHERE syncState='pending' AND institutionId=?
         ORDER BY academicYearId, gradeLevel, studentId`,
      )
      .all(institutionId) as PendingRow[];
    const groups = new Map<string, PendingRow[]>();
    for (const row of rows) {
      const key = JSON.stringify([row.academicYearId, row.gradeLevel]);
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }
    return groups;
  }

  /** Only rows still pending and untouched since they were read: a decision
   * re-saved while the request was in flight stays pending for the next push. */
  #mark(
    db: SqliteDatabase,
    rows: PendingRow[],
    state: 'synced' | 'rejected',
    syncError: string | null,
  ): void {
    const update = db.prepare(
      `UPDATE grade_completions SET syncState=?, syncError=?
       WHERE id=? AND syncState='pending' AND updatedAt=?`,
    );
    db.transaction(() => {
      for (const row of rows) update.run(state, syncError, row.id, row.updatedAt);
    })();
  }
}
