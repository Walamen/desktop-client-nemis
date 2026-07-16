import type { AppendAuditEntryInput } from '../../dto/platform';
import type { Page, PageOptions, QueryOptions } from '../../dto/query';
import type { AuditCategory, AuditLogEntry } from '../../models/platform';

/** Append-only by contract: no update/delete is exposed; prune is the only removal. */
export interface IAuditLogRepository {
  append(input: AppendAuditEntryInput): AuditLogEntry;
  findByCategory(category: AuditCategory, options?: QueryOptions): AuditLogEntry[];
  findInRange(fromIso: string, toIso: string, options?: QueryOptions): AuditLogEntry[];
  findPage(options: PageOptions): Page<AuditLogEntry>;
  count(): number;
  /** Retention housekeeping: deletes entries older than the ISO cutoff. */
  prune(olderThan: string): number;
}
