import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CountyDistrictsOutput } from '../../dto/county/county-districts-dto';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyDistrictsReadModel } from '../../interfaces/county/county-districts-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyDistrictsDeps {
  readModel: ICountyDistrictsReadModel;
  countyReadModel: ICountyAnalyticsReadModel;
  logger: IAppLogger;
}

/** District Management page + Manage DEO drawer data (portal-web's
 * getDistrictsByCounty, getCountyUsers(role DEO) and getDistrictOfficers). */
export class GetCountyDistrictsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<CountyDistrictsOutput>
> {
  constructor(private readonly deps: GetCountyDistrictsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountyDistrictsOutput>> {
    return invokeUseCase('GetCountyDistricts', this.deps.logger, async () => {
      const districts = this.deps.readModel.listActiveDistricts();
      return ok({
        county: this.deps.countyReadModel.getCounty(),
        districts,
        deoUsers: this.deps.readModel.listCountyDeoUsers(),
        officersByDistrict: Object.fromEntries(
          districts.map((district) => [district.id, this.deps.readModel.listDistrictOfficers(district.id)]),
        ),
      });
    });
  }
}
