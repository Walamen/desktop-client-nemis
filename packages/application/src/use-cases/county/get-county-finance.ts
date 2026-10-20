import type {
  CountyFeeCollectionsQuery,
  CountyFeeCollectionsResult,
  CountyFeeRulesQuery,
  CountyFeeRulesResult,
  CountyFinanceDashboard,
  CountySchoolFinanceRow,
} from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyFinanceReadModel } from '../../interfaces/county/county-finance-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyFinanceDeps {
  readModel: ICountyFinanceReadModel;
  logger: IAppLogger;
}

export interface GetCountyFinanceDashboardDeps extends GetCountyFinanceDeps {
  countyReadModel: ICountyAnalyticsReadModel;
}

/** Surrounding spaces never reach the search; blank search is no filter. */
function trimmedSearch<Q extends { search?: string }>(query: Q): Q {
  return { ...query, search: query.search?.trim() || undefined };
}

/** Finance overview cards and district comparison, plus the county for the header. */
export class GetCountyFinanceDashboardUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<CountyFinanceDashboard>
> {
  constructor(private readonly deps: GetCountyFinanceDashboardDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountyFinanceDashboard>> {
    return invokeUseCase('GetCountyFinanceDashboard', this.deps.logger, async () =>
      ok({ ...this.deps.readModel.getDashboard(), county: this.deps.countyReadModel.getCounty() }),
    );
  }
}

/** Finance "All Schools" tab. */
export class GetCountyFinanceSchoolsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<CountySchoolFinanceRow[]>
> {
  constructor(private readonly deps: GetCountyFinanceDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountySchoolFinanceRow[]>> {
    return invokeUseCase('GetCountyFinanceSchools', this.deps.logger, async () =>
      ok(this.deps.readModel.listSchools()),
    );
  }
}

/** Finance "Payments" tab: one page of payments plus the filtered-set summary. */
export class GetCountyFeeCollectionsUseCase implements QueryHandler<
  CountyFeeCollectionsQuery,
  ApplicationResponse<CountyFeeCollectionsResult>
> {
  constructor(private readonly deps: GetCountyFinanceDeps) {}

  execute(query: CountyFeeCollectionsQuery): Promise<ApplicationResponse<CountyFeeCollectionsResult>> {
    return invokeUseCase('GetCountyFeeCollections', this.deps.logger, async () =>
      ok(this.deps.readModel.listFeeCollections(trimmedSearch(query))),
    );
  }
}

/** Fee Rules page: one page of schools, each with its rules. */
export class GetCountyFeeRulesUseCase implements QueryHandler<
  CountyFeeRulesQuery,
  ApplicationResponse<CountyFeeRulesResult>
> {
  constructor(private readonly deps: GetCountyFinanceDeps) {}

  execute(query: CountyFeeRulesQuery): Promise<ApplicationResponse<CountyFeeRulesResult>> {
    return invokeUseCase('GetCountyFeeRules', this.deps.logger, async () =>
      ok(this.deps.readModel.listFeeRules(trimmedSearch(query))),
    );
  }
}
