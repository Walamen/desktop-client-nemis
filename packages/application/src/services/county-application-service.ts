import type { ApplicationResponse } from '../core/response';
import type { CountyDashboardOutput } from '../dto/county/county-dashboard-dto';
import type { CountyDistrictDetailOutput, CountyDistrictsOutput } from '../dto/county/county-districts-dto';
import type { CountySchoolDetailOutput, CountySchoolsOutput } from '../dto/county/county-schools-dto';
import type { GetCountyDashboardUseCase } from '../use-cases/county/get-county-dashboard';
import type { GetCountyDistrictsUseCase } from '../use-cases/county/get-county-districts';
import type { GetCountyDistrictDetailUseCase } from '../use-cases/county/get-county-district-detail';
import type { GetCountySchoolsUseCase } from '../use-cases/county/get-county-schools';
import type { GetCountySchoolDetailUseCase } from '../use-cases/county/get-county-school-detail';

export interface CountyApplicationServiceDeps {
  getDashboard: GetCountyDashboardUseCase;
  listDistricts: GetCountyDistrictsUseCase;
  getDistrict: GetCountyDistrictDetailUseCase;
  listSchools: GetCountySchoolsUseCase;
  getSchool: GetCountySchoolDetailUseCase;
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
  listSchools(): Promise<ApplicationResponse<CountySchoolsOutput>> {
    return this.deps.listSchools.execute({});
  }
  getSchool(schoolId: string): Promise<ApplicationResponse<CountySchoolDetailOutput>> {
    return this.deps.getSchool.execute({ schoolId });
  }
}
