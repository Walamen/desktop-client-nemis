import type { CountyAuditPage, CountyAuditQuery, CountyAuditStats, CountySettings } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ICountyAuditReadModel, ICountySettingsReadModel } from '../../interfaces/county/county-audit-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface CountyAuditDeps {
  readModel: ICountyAuditReadModel;
  logger: IAppLogger;
}

export interface CountySettingsDeps {
  readModel: ICountySettingsReadModel;
  logger: IAppLogger;
}

const MAX_LIMIT = 100;

const blankToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Audit cards and filter options. */
export class GetCountyAuditStatsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<CountyAuditStats>
> {
  constructor(private readonly deps: CountyAuditDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountyAuditStats>> {
    return invokeUseCase('GetCountyAuditStats', this.deps.logger, async () => ok(this.deps.readModel.getStats()));
  }
}

/** One page of the audit timeline. */
export class GetCountyAuditLogsUseCase implements QueryHandler<CountyAuditQuery, ApplicationResponse<CountyAuditPage>> {
  constructor(private readonly deps: CountyAuditDeps) {}

  execute(query: CountyAuditQuery): Promise<ApplicationResponse<CountyAuditPage>> {
    return invokeUseCase('GetCountyAuditLogs', this.deps.logger, async () =>
      ok(
        this.deps.readModel.list({
          page: Math.max(1, Math.floor(query.page) || 1),
          limit: Math.min(MAX_LIMIT, Math.max(1, Math.floor(query.limit) || 1)),
          search: blankToUndefined(query.search),
          action: blankToUndefined(query.action),
          entityType: blankToUndefined(query.entityType),
        }),
      ),
    );
  }
}

export class GetCountySettingsUseCase implements QueryHandler<Record<string, never>, ApplicationResponse<CountySettings>> {
  constructor(private readonly deps: CountySettingsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountySettings>> {
    return invokeUseCase('GetCountySettings', this.deps.logger, async () => ok(this.deps.readModel.get()));
  }
}
