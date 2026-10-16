import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CountySchoolsOutput } from '../../dto/county/county-schools-dto';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyDistrictsReadModel } from '../../interfaces/county/county-districts-read-model';
import type { ICountySchoolsReadModel } from '../../interfaces/county/county-schools-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountySchoolsDeps {
  readModel: ICountySchoolsReadModel;
  districtsReadModel: ICountyDistrictsReadModel;
  countyReadModel: ICountyAnalyticsReadModel;
  logger: IAppLogger;
}

/** Schools list page data (portal-web's getSchoolsByCounty, plus the
 * Districts card's active-district count). */
export class GetCountySchoolsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<CountySchoolsOutput>
> {
  constructor(private readonly deps: GetCountySchoolsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountySchoolsOutput>> {
    return invokeUseCase('GetCountySchools', this.deps.logger, async () =>
      ok({
        county: this.deps.countyReadModel.getCounty(),
        districtCount: this.deps.districtsReadModel.listActiveDistricts().length,
        schools: this.deps.readModel.listActiveSchools(),
      }),
    );
  }
}
