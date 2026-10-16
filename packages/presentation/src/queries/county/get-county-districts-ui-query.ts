import type {
  ApplicationResponse,
  CountyApplicationService,
  CountyDistrictsOutput,
} from '@nemis-desktop/application';

export class GetCountyDistrictsUiQuery {
  constructor(private readonly county: CountyApplicationService) {}

  execute(): Promise<ApplicationResponse<CountyDistrictsOutput>> {
    return this.county.listDistricts();
  }
}
