import type { ApplicationResponse } from '../core/response';
import type { CountyDashboardOutput } from '../dto/county/county-dashboard-dto';
import type { CountyDistrictDetailOutput, CountyDistrictsOutput } from '../dto/county/county-districts-dto';
import type { GetCountyDashboardUseCase } from '../use-cases/county/get-county-dashboard';
import type { GetCountyDistrictsUseCase } from '../use-cases/county/get-county-districts';
import type { GetCountyDistrictDetailUseCase } from '../use-cases/county/get-county-district-detail';

export interface CountyApplicationServiceDeps {
  getDashboard: GetCountyDashboardUseCase;
  listDistricts: GetCountyDistrictsUseCase;
  getDistrict: GetCountyDistrictDetailUseCase;
}

/** The County (CEO) portal's application service. */
export class CountyApplicationService {
  constructor(private readonly deps: CountyApplicationServiceDeps) {}
  getDashboard(): Promise<ApplicationResponse<CountyDashboardOutput>> {
    return this.deps.getDashboard.execute({});
  }
  listDistricts(): Promise<ApplicationResponse<CountyDistrictsOutput>> {
    return this.deps.listDistricts.execute({});
  }
  getDistrict(districtId: string): Promise<ApplicationResponse<CountyDistrictDetailOutput>> {
    return this.deps.getDistrict.execute({ districtId });
  }
}
