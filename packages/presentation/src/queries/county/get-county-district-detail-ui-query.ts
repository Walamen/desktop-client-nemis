import type {
  ApplicationResponse,
  CountyApplicationService,
  CountyDistrictDetailOutput,
} from '@nemis-desktop/application';

export class GetCountyDistrictDetailUiQuery {
  constructor(private readonly county: CountyApplicationService) {}

  execute(districtId: string): Promise<ApplicationResponse<CountyDistrictDetailOutput>> {
    return this.county.getDistrict(districtId);
  }
}
