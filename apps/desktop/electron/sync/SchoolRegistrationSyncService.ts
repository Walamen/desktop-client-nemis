import type { Database as SqliteDatabase } from 'better-sqlite3';
import { RemoteRejectedError } from '@nemis-desktop/shared';
import type { SchoolRegistrationPayload } from '@nemis-desktop/types';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import { logger } from '@app/services/logger';
import { SCHOOL_REGISTRATION_PENDING } from './pendingPredicates';

interface PendingRow {
  id: string;
  payload: string;
  updatedAt: string;
}

const FALLBACK_REFUSAL = 'The server refused this school.';

/** Sends the County Admin's waiting schools (school_registrations) to the
 * web's POST /institutions, one request per school, oldest first —
 * deliberately outside the generic sync_queue (institutions has no outbox).
 * A 4xx refuses that school only; a network error, an expired session, a rate
 * limit or a 5xx leaves it (and the rest) waiting for the next cycle. Never throws. */
export class SchoolRegistrationSyncService {
  constructor(private readonly gateway: Pick<BackendProvisioningGateway, 'createInstitution'>) {}

  async pushPending(db: SqliteDatabase, userId: string): Promise<{ accepted: number; rejected: number }> {
    let rows: PendingRow[];
    try {
      rows = db
        .prepare(
          `SELECT id, payload, updatedAt FROM school_registrations
           WHERE ${SCHOOL_REGISTRATION_PENDING} ORDER BY createdAt, id`,
        )
        .all(userId) as PendingRow[];
    } catch (error) {
      logger.error('SchoolRegistrationSyncService: could not read waiting schools', error);
      return { accepted: 0, rejected: 0 };
    }

    let accepted = 0;
    let rejected = 0;
    for (const row of rows) {
      try {
        let payload: SchoolRegistrationPayload;
        try {
          payload = JSON.parse(row.payload) as SchoolRegistrationPayload;
        } catch {
          logger.error(`SchoolRegistrationSyncService: unreadable payload for ${row.id}; left waiting`);
          continue;
        }
        let principal: { email: string; defaultPassword: string } | null;
        try {
          ({ principal } = await this.gateway.createInstitution(row.id, payload));
        } catch (error) {
          if (error instanceof RemoteRejectedError) {
            const marked = this.#mark(db, row, {
              syncState: 'rejected',
              syncError: error.remoteMessage || FALLBACK_REFUSAL,
              principal: null,
            });
            if (marked) rejected += 1;
            continue;
          }
          // Unreachable, expired session, rate limit or 5xx: every later
          // school would meet the same, each costing a session restore and
          // up to a 120 s timeout while the worker is held. Stop; next cycle.
          logger.error(`SchoolRegistrationSyncService: could not send ${row.id}; stopping until the next cycle`, error);
          break;
        }
        if (this.#mark(db, row, { syncState: 'synced', syncError: null, principal })) accepted += 1;
      } catch (error) {
        logger.error(`SchoolRegistrationSyncService: unexpected failure for ${row.id}`, error);
      }
    }
    return { accepted, rejected };
  }

  /** Only a row still waiting and untouched since it was read: a school
   * resubmitted while its request was in flight stays waiting for the next push. */
  #mark(
    db: SqliteDatabase,
    row: PendingRow,
    outcome: {
      syncState: 'synced' | 'rejected';
      syncError: string | null;
      principal: { email: string; defaultPassword: string } | null;
    },
  ): boolean {
    const now = new Date().toISOString();
    return (
      db
        .prepare(
          `UPDATE school_registrations
           SET syncState = ?, syncError = ?, principalEmail = ?, principalPassword = ?,
               syncedAt = CASE WHEN ? = 'synced' THEN ? ELSE syncedAt END
           WHERE id = ? AND syncState = 'pending' AND updatedAt = ?`,
        )
        .run(
          outcome.syncState,
          outcome.syncError,
          outcome.principal?.email ?? null,
          outcome.principal?.defaultPassword ?? null,
          outcome.syncState,
          now,
          row.id,
          row.updatedAt,
        ).changes === 1
    );
  }
}
