import type { PendingGroupSummary } from '@nemis-desktop/types';
import { GRADE_COMPLETION_PENDING, STUDENT_RECORDS_UNSETTLED } from '../pendingPredicates';
import { buildGroup } from './groups';
import type { PendingContext, PendingSourceAdapter, RawPendingRow } from './types';

/** End-of-year decisions push through GradeCompletionSyncService, scoped to
 * the workspace's institution, and wait while any student/enrolment row can
 * still sync (the same gate the push uses). */
export class GradeCompletionPendingSource implements PendingSourceAdapter {
  readonly source = 'grade_completions' as const;

  summarize(ctx: PendingContext): PendingGroupSummary[] {
    const { total, oldestAt } = ctx.db.prepare(
      `SELECT COUNT(*) AS total, MIN(updatedAt) AS oldestAt FROM grade_completions WHERE ${GRADE_COMPLETION_PENDING}`,
    ).get(ctx.institutionId) as { total: number; oldestAt: string | null };
    if (total === 0 || !oldestAt) return [];
    const byState = this.#blocked(ctx) ? { held: total } : { waiting: total };
    return [buildGroup('grade_completions', 'grade_completions', byState, oldestAt)];
  }

  listRecords(ctx: PendingContext, entityType: string, limit: number, offset: number) {
    if (entityType !== 'grade_completions') return { rows: [], total: 0 };
    const state = this.#blocked(ctx) ? 'held' : 'waiting';
    const rows = ctx.db.prepare(
      `SELECT * FROM grade_completions WHERE ${GRADE_COMPLETION_PENDING} ORDER BY updatedAt, id LIMIT ? OFFSET ?`,
    ).all(ctx.institutionId, limit, offset) as Array<Record<string, unknown> & { id: string; updatedAt: string }>;
    return {
      rows: rows.map((row): RawPendingRow => ({
        id: row.id,
        entityType: 'grade_completions',
        entityId: row.id,
        operationType: 'create',
        state,
        createdAt: row.updatedAt,
        nextAttemptAt: null,
        retryCount: 0,
        lastError: null,
        payload: row,
      })),
      total: this.countPending(ctx),
    };
  }

  countPending(ctx: PendingContext): number {
    return (ctx.db.prepare(
      `SELECT COUNT(*) AS n FROM grade_completions WHERE ${GRADE_COMPLETION_PENDING}`,
    ).get(ctx.institutionId) as { n: number }).n;
  }

  countFailed(ctx: PendingContext): number {
    return (ctx.db.prepare(
      `SELECT COUNT(*) AS n FROM grade_completions WHERE syncState='rejected' AND institutionId=?`,
    ).get(ctx.institutionId) as { n: number }).n;
  }

  #blocked(ctx: PendingContext): boolean {
    return (ctx.db.prepare(`SELECT ${STUDENT_RECORDS_UNSETTLED} AS blocked`).get() as { blocked: number }).blocked === 1;
  }
}
