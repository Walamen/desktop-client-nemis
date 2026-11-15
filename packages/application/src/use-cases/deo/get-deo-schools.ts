import type { DeoSchoolsResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { buildDistrictSchoolRows, type DistrictSchoolRowsDeps } from './district-school-rows';

export interface GetDeoSchoolsDeps extends DistrictSchoolRowsDeps {
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  clock: IClock;
  logger: IAppLogger;
}

/** The DEO Schools Management page, from this device. The rows are the
 * dashboard's (buildDistrictSchoolRows), so the two pages always agree. */
export class GetDeoSchoolsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DeoSchoolsResult>
> {
  constructor(private readonly deps: GetDeoSchoolsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoSchoolsResult>> {
    return invokeUseCase('GetDeoSchools', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) return ok({ districtId: null, district: null, county: null, schools: [] });
      const { readModel } = this.deps;
      const district = readModel.getDistrict(districtId);
      const county = district ? readModel.getCounty(district.countyId) : null;
      return ok({
        districtId,
        district: district ? { id: district.id, name: district.name } : null,
        county,
        schools: buildDistrictSchoolRows(
          this.deps,
          districtId,
          new Date(this.deps.clock.now()),
          readModel.listOpenAlerts(districtId),
        ),
      });
    });
  }
}
