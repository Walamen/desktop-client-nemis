import type { PendingGroupSummary } from '@nemis-desktop/types';
import { SCHOOL_REGISTRATION_PENDING } from '../pendingPredicates';
import { buildGroup } from './groups';
import { parsePayload, type PendingContext, type PendingSourceAdapter, type RawPendingRow } from './types';

/** Schools a County Admin saved offline push through
 * SchoolRegistrationSyncService, scoped to the signed-in user and the synced
 * county (the same predicate the push uses). Refused ones count as failures. */
export class SchoolRegistrationPendingSource implements PendingSourceAdapter {
  readonly source = 'school_registrations' as const;

  summarize(ctx: PendingContext): PendingGroupSummary[] {
    const { total, oldestAt } = ctx.db.prepare(
      `SELECT COUNT(*) AS total, MIN(updatedAt) AS oldestAt FROM school_registrations WHERE ${SCHOOL_REGISTRATION_PENDING}`,
    ).get(ctx.userId) as { total: number; oldestAt: string | null };
    if (total === 0 || !oldestAt) return [];
    return [buildGroup('school_registrations', 'school_registrations', { waiting: total }, oldestAt)];
  }

  listRecords(ctx: PendingContext, entityType: string, limit: number, offset: number) {
    if (entityType !== 'school_registrations') return { rows: [], total: 0 };
    const rows = ctx.db.prepare(
      `SELECT id, payload, updatedAt FROM school_registrations WHERE ${SCHOOL_REGISTRATION_PENDING}
       ORDER BY updatedAt, id LIMIT ? OFFSET ?`,
    ).all(ctx.userId, limit, offset) as Array<{ id: string; payload: string; updatedAt: string }>;
    return {
      rows: rows.map((row): RawPendingRow => ({
        id: row.id,
        entityType: 'school_registrations',
        entityId: row.id,
        operationType: 'create',
        state: 'waiting',
        createdAt: row.updatedAt,
        nextAttemptAt: null,
        retryCount: 0,
        lastError: null,
        payload: parsePayload(row.payload),
      })),
      total: this.countPending(ctx),
    };
  }

  countPending(ctx: PendingContext): number {
    return (ctx.db.prepare(
      `SELECT COUNT(*) AS n FROM school_registrations WHERE ${SCHOOL_REGISTRATION_PENDING}`,
    ).get(ctx.userId) as { n: number }).n;
  }

  countFailed(ctx: PendingContext): number {
    return (ctx.db.prepare(
      `SELECT COUNT(*) AS n FROM school_registrations
       WHERE syncState='rejected' AND createdBy=? AND countyId IN (SELECT id FROM counties)`,
    ).get(ctx.userId) as { n: number }).n;
  }
}
