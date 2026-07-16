import { newId } from '../../../database/helpers/ids';
import { nowIso } from '../../../database/helpers/time';
import { TableNames } from '../../../database/schema/tableNames';
import type { AppendAuditEntryInput } from '../../dto/platform';
import type { QueryOptions } from '../../dto/query';
import { serializeJsonColumn } from '../../mappers/json';
import { auditLogMapper, type AuditLogRow } from '../../mappers/platformMappers';
import type { AuditCategory, AuditLogEntry } from '../../models/platform';
import { deleteFrom } from '../../queries/builders';
import { and, eq, gte, lt, lte } from '../../queries/predicates';
import { validateAppendAudit, validateAuditPrune } from '../../validators/platform';
import { BaseRepository } from '../base/BaseRepository';
import type { RepositoryContext } from '../base/RepositoryContext';
import type { IAuditLogRepository } from '../interfaces/IAuditLogRepository';

const AUDIT_LOG_COLUMNS = ['id', 'category', 'event', 'details', 'createdAt'] as const;

export class SqliteAuditLogRepository
  extends BaseRepository<AuditLogRow, AuditLogEntry>
  implements IAuditLogRepository
{
  constructor(context: RepositoryContext) {
    super(context, {
      table: TableNames.auditLog,
      entityName: 'AuditLogEntry',
      columns: AUDIT_LOG_COLUMNS,
      mapper: auditLogMapper,
    });
  }

  append(input: AppendAuditEntryInput): AuditLogEntry {
    this.validate(validateAppendAudit, input);
    return this.insertRow({
      id: newId(),
      category: input.category,
      event: input.event,
      details: serializeJsonColumn(input.details, 'audit_log.details'),
      createdAt: nowIso(),
    });
  }

  findByCategory(category: AuditCategory, options?: QueryOptions): AuditLogEntry[] {
    return this.selectWhere('findByCategory', eq('category', category), options);
  }

  findInRange(fromIso: string, toIso: string, options?: QueryOptions): AuditLogEntry[] {
    return this.selectWhere(
      'findInRange',
      and(gte('createdAt', fromIso), lte('createdAt', toIso)),
      options,
    );
  }

  prune(olderThan: string): number {
    this.validate(validateAuditPrune, { olderThan });
    return this.query('prune', () => {
      const built = deleteFrom(TableNames.auditLog).where(lt('createdAt', olderThan)).build();
      return this.statements.get(built.sql).run(...built.params).changes;
    });
  }
}
