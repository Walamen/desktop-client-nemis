import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CountyDistrictDetailOutput } from '../../dto/county/county-districts-dto';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyDistrictsReadModel } from '../../interfaces/county/county-districts-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyDistrictDetailDeps {
  readModel: ICountyDistrictsReadModel;
  countyReadModel: ICountyAnalyticsReadModel;
  logger: IAppLogger;
}

/** District Details page data; stats follow districts.service getDistrictStats. */
export class GetCountyDistrictDetailUseCase implements QueryHandler<
  { districtId: string },
  ApplicationResponse<CountyDistrictDetailOutput>
> {
  constructor(private readonly deps: GetCountyDistrictDetailDeps) {}

  execute(query: { districtId: string }): Promise<ApplicationResponse<CountyDistrictDetailOutput>> {
    return invokeUseCase('GetCountyDistrictDetail', this.deps.logger, async () => {
      const readModel = this.deps.readModel;
      const district = readModel.getDistrict(query.districtId);
      if (!district) return ok(null);
      const counts = readModel.getDistrictCounts(district.id);
      return ok({
        county: this.deps.countyReadModel.getCounty(),
        district,
        officers: readModel.listDistrictOfficers(district.id),
        institutions: readModel.listDistrictInstitutions(district.id),
        stats: {
          totalSchools: counts.schools,
          totalStudents: counts.students,
          totalTeachers: counts.teachers,
          deoCount: counts.deos,
          studentTeacherRatio: counts.teachers > 0 ? Math.round(counts.students / counts.teachers) : 0,
        },
      });
    });
  }
}
