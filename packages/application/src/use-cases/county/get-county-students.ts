import type { CountyStudentsQuery, CountyStudentsResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyDistrictsReadModel } from '../../interfaces/county/county-districts-read-model';
import type { ICountyStudentsReadModel } from '../../interfaces/county/county-students-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyStudentsDeps {
  readModel: ICountyStudentsReadModel;
  districtsReadModel: ICountyDistrictsReadModel;
  countyReadModel: ICountyAnalyticsReadModel;
  logger: IAppLogger;
}

/** Students list page data: one call for what portal-web fetches in five
 * (county, districts, schools, stats, the page). */
export class GetCountyStudentsUseCase implements QueryHandler<
  CountyStudentsQuery,
  ApplicationResponse<CountyStudentsResult>
> {
  constructor(private readonly deps: GetCountyStudentsDeps) {}

  execute(query: CountyStudentsQuery): Promise<ApplicationResponse<CountyStudentsResult>> {
    return invokeUseCase('GetCountyStudents', this.deps.logger, async () =>
      ok({
        ...this.deps.readModel.listStudents(query),
        county: this.deps.countyReadModel.getCounty(),
        districts: this.deps.districtsReadModel.listActiveDistricts().map((d) => ({ id: d.id, name: d.name })),
      }),
    );
  }
}
