import type { CountyUsersQuery, CountyUsersResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyUsersReadModel } from '../../interfaces/county/county-users-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyUsersDeps {
  readModel: ICountyUsersReadModel;
  countyReadModel: ICountyAnalyticsReadModel;
  logger: IAppLogger;
}

/** Administrative Users list page data: the page and stats plus the county name. */
export class GetCountyUsersUseCase implements QueryHandler<CountyUsersQuery, ApplicationResponse<CountyUsersResult>> {
  constructor(private readonly deps: GetCountyUsersDeps) {}

  execute(query: CountyUsersQuery): Promise<ApplicationResponse<CountyUsersResult>> {
    return invokeUseCase('GetCountyUsers', this.deps.logger, async () =>
      ok({
        ...this.deps.readModel.listUsers(query),
        county: this.deps.countyReadModel.getCounty(),
      }),
    );
  }
}
