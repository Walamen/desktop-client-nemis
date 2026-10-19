import type { CountyUserOptions } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyUsersReadModel } from '../../interfaces/county/county-users-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyUserOptionsDeps {
  readModel: ICountyUsersReadModel;
  countyReadModel: ICountyAnalyticsReadModel;
  logger: IAppLogger;
}

/** Districts and schools for the assign and create forms, plus the county name. */
export class GetCountyUserOptionsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<CountyUserOptions>
> {
  constructor(private readonly deps: GetCountyUserOptionsDeps) {}

  execute(_query: Record<string, never> = {}): Promise<ApplicationResponse<CountyUserOptions>> {
    return invokeUseCase('GetCountyUserOptions', this.deps.logger, async () =>
      ok({
        ...this.deps.readModel.listOptions(),
        county: this.deps.countyReadModel.getCounty(),
      }),
    );
  }
}
