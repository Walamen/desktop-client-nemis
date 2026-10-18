import type { CountyTeachersQuery, CountyTeachersResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyTeachersReadModel } from '../../interfaces/county/county-teachers-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyTeachersDeps {
  readModel: ICountyTeachersReadModel;
  countyReadModel: ICountyAnalyticsReadModel;
  logger: IAppLogger;
}

/** Teachers list page data: one call for what portal-web fetches in three
 * (county, stats, the page). */
export class GetCountyTeachersUseCase implements QueryHandler<
  CountyTeachersQuery,
  ApplicationResponse<CountyTeachersResult>
> {
  constructor(private readonly deps: GetCountyTeachersDeps) {}

  execute(query: CountyTeachersQuery): Promise<ApplicationResponse<CountyTeachersResult>> {
    return invokeUseCase('GetCountyTeachers', this.deps.logger, async () =>
      ok({ ...this.deps.readModel.listTeachers(query), county: this.deps.countyReadModel.getCounty() }),
    );
  }
}
