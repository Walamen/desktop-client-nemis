import type { AppendAuditEntryInput } from '../dto/platform';
import type { Page, PageOptions, QueryOptions } from '../dto/query';
import type { AuditCategory, AuditLogEntry } from '../models/platform';
import type { IAuditLogRepository } from '../repositories/interfaces/IAuditLogRepository';

export interface AuditLogServiceDeps {
  auditLog: IAuditLogRepository;
}

export class AuditLogService {
  readonly #deps: AuditLogServiceDeps;

  constructor(deps: AuditLogServiceDeps) {
    this.#deps = deps;
  }

  append(input: AppendAuditEntryInput): Promise<AuditLogEntry> {
    return Promise.resolve(this.#deps.auditLog.append(input));
  }

  findByCategory(category: AuditCategory, options?: QueryOptions): Promise<AuditLogEntry[]> {
    return Promise.resolve(this.#deps.auditLog.findByCategory(category, options));
  }

  page(options: PageOptions): Promise<Page<AuditLogEntry>> {
    return Promise.resolve(this.#deps.auditLog.findPage(options));
  }

  prune(olderThan: string): Promise<number> {
    return Promise.resolve(this.#deps.auditLog.prune(olderThan));
  }
}
