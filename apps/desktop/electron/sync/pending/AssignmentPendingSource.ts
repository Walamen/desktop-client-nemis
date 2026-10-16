import type { PendingGroupSummary } from '@nemis-desktop/types';
import { ASSIGNMENT_DIRTY, SUBMISSION_DIRTY } from '../pendingPredicates';
import { buildGroup } from './groups';
import type { PendingContext, PendingSourceAdapter, RawPendingRow } from './types';

const SUBMISSIONS_FROM = `FROM assignment_submissions s JOIN assignments a ON a.id = s.assignmentId WHERE ${SUBMISSION_DIRTY}`;

/** Assignments and their grades push through AssignmentSyncService, not the
 * outbox. No backoff there, so nothing is ever 'retrying'; a grade waits
 * ('held') until its assignment has a server id. */
export class AssignmentPendingSource implements PendingSourceAdapter {
  readonly source = 'assignments' as const;

  summarize(ctx: PendingContext): PendingGroupSummary[] {
    const groups: PendingGroupSummary[] = [];
    const a = ctx.db.prepare(
      `SELECT COUNT(*) AS total, MIN(updatedAt) AS oldestAt FROM assignments WHERE ${ASSIGNMENT_DIRTY}`,
    ).get() as { total: number; oldestAt: string | null };
    if (a.total > 0 && a.oldestAt) groups.push(buildGroup('assignments', 'assignments', { waiting: a.total }, a.oldestAt));
    const s = ctx.db.prepare(
      `SELECT COUNT(*) AS total, SUM(a.remoteId IS NULL) AS held, MIN(s.updatedAt) AS oldestAt ${SUBMISSIONS_FROM}`,
    ).get() as { total: number; held: number | null; oldestAt: string | null };
    if (s.total > 0 && s.oldestAt) {
      const held = s.held ?? 0;
      groups.push(buildGroup('assignments', 'assignment_submissions', { waiting: s.total - held, held }, s.oldestAt));
    }
    return groups;
  }

  listRecords(ctx: PendingContext, entityType: string, limit: number, offset: number) {
    if (entityType === 'assignments') {
      const rows = ctx.db.prepare(
        `SELECT * FROM assignments WHERE ${ASSIGNMENT_DIRTY} ORDER BY updatedAt, id LIMIT ? OFFSET ?`,
      ).all(limit, offset) as Array<Record<string, unknown> & { id: string; remoteId: string | null; updatedAt: string }>;
      return {
        rows: rows.map((row): RawPendingRow => ({
          ...base(row.id, 'assignments', row.updatedAt, row),
          operationType: row.remoteId ? 'update' : 'create',
          state: 'waiting',
        })),
        total: this.#count(ctx, `SELECT COUNT(*) AS n FROM assignments WHERE ${ASSIGNMENT_DIRTY}`),
      };
    }
    if (entityType === 'assignment_submissions') {
      const rows = ctx.db.prepare(
        `SELECT s.*, a.remoteId AS assignmentRemoteId ${SUBMISSIONS_FROM} ORDER BY s.updatedAt, s.id LIMIT ? OFFSET ?`,
      ).all(limit, offset) as Array<Record<string, unknown> & { id: string; updatedAt: string; assignmentRemoteId: string | null }>;
      return {
        rows: rows.map((row): RawPendingRow => ({
          ...base(row.id, 'assignment_submissions', row.updatedAt, row),
          operationType: 'update',
          state: row.assignmentRemoteId ? 'waiting' : 'held',
        })),
        total: this.#count(ctx, `SELECT COUNT(*) AS n ${SUBMISSIONS_FROM}`),
      };
    }
    return { rows: [], total: 0 };
  }

  countPending(ctx: PendingContext): number {
    return this.#count(ctx, `SELECT COUNT(*) AS n FROM assignments WHERE ${ASSIGNMENT_DIRTY}`)
      + this.#count(ctx, `SELECT COUNT(*) AS n ${SUBMISSIONS_FROM}`);
  }

  countFailed(): number {
    return 0;
  }

  #count(ctx: PendingContext, sql: string): number {
    return (ctx.db.prepare(sql).get() as { n: number }).n;
  }
}

function base(id: string, entityType: string, changedAt: string, payload: unknown) {
  return { id, entityType, entityId: id, createdAt: changedAt, nextAttemptAt: null, retryCount: 0, lastError: null, payload };
}
