import type { CountyGuardiansQuery, CountyGuardiansResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyDistrictsReadModel } from '../../interfaces/county/county-districts-read-model';
import type { ICountyGuardiansReadModel } from '../../interfaces/county/county-guardians-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyGuardiansDeps {
  readModel: ICountyGuardiansReadModel;
  districtsReadModel: ICountyDistrictsReadModel;
  countyReadModel: ICountyAnalyticsReadModel;
  logger: IAppLogger;
}

/** Parents & Guardians list page data: one call for what portal-web fetches in
 * four (county, stats, districts, guardians). */
export class GetCountyGuardiansUseCase implements QueryHandler<
  CountyGuardiansQuery,
  ApplicationResponse<CountyGuardiansResult>
> {
  constructor(private readonly deps: GetCountyGuardiansDeps) {}

  execute(query: CountyGuardiansQuery): Promise<ApplicationResponse<CountyGuardiansResult>> {
    return invokeUseCase('GetCountyGuardians', this.deps.logger, async () =>
      ok({
        ...this.deps.readModel.listGuardians(query),
        county: this.deps.countyReadModel.getCounty(),
        districts: this.deps.districtsReadModel.listActiveDistricts().map((d) => ({ id: d.id, name: d.name })),
      }),
    );
  }
}
