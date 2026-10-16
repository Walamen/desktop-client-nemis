import type {
  ListPendingRecordsRequest,
  ListPendingRecordsResult,
  PendingGroupSummary,
  PendingSummary,
} from '@nemis-desktop/types';
import { logger } from '@app/services/logger';
import { AssignmentPendingSource } from './AssignmentPendingSource';
import { FeeReversalPendingSource } from './FeeReversalPendingSource';
import { GradeCompletionPendingSource } from './GradeCompletionPendingSource';
import { parseGroupKey } from './groups';
import { OutboxPendingSource } from './OutboxPendingSource';
import { PendingLabelResolver } from './PendingLabelResolver';
import type { PendingContext, PendingSourceAdapter } from './types';

export const MAX_PENDING_PAGE = 200;

/** Everything on this device not yet accepted by the server, across the
 * generic outbox and every bespoke push path — the read model behind the
 * Pending changes page and the status bar's pending count. */
export class PendingChangesService {
  constructor(
    private readonly sources: readonly PendingSourceAdapter[] = [
      new OutboxPendingSource(),
      new AssignmentPendingSource(),
      new GradeCompletionPendingSource(),
      new FeeReversalPendingSource(),
    ],
    private readonly labels = new PendingLabelResolver(),
  ) {}

  getSummary(ctx: PendingContext): PendingSummary {
    const groups: PendingGroupSummary[] = [];
    let failedCount = 0;
    let partial = false;
    for (const source of this.sources) {
      try {
        const sourceGroups = source.summarize(ctx);
        const sourceFailed = source.countFailed(ctx);
        groups.push(...sourceGroups);
        failedCount += sourceFailed;
      } catch (error) {
        partial = true;
        logger.error(`PendingChangesService: the ${source.source} source could not be read`, error);
      }
    }
    groups.sort((a, b) => a.oldestAt.localeCompare(b.oldestAt) || a.groupKey.localeCompare(b.groupKey));
    return { groups, total: groups.reduce((sum, group) => sum + group.total, 0), failedCount, partial };
  }

  listRecords(ctx: PendingContext, request: ListPendingRecordsRequest): ListPendingRecordsResult {
    const parsed = parseGroupKey(request.groupKey);
    const source = parsed ? this.sources.find((candidate) => candidate.source === parsed.source) : undefined;
    if (!parsed || !source) return { records: [], total: 0 };
    const limit = Math.min(Math.max(request.limit, 1), MAX_PENDING_PAGE);
    const offset = Math.max(request.offset, 0);
    const { rows, total } = source.listRecords(ctx, parsed.entityType, limit, offset);
    return { records: this.labels.resolve(ctx.db, rows), total };
  }

  countPending(ctx: PendingContext): number {
    return this.sources.reduce((sum, source) => sum + source.countPending(ctx), 0);
  }
}
