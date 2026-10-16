import type {
  ApplicationResponse,
  CountyApplicationService,
  CountySchoolsOutput,
} from '@nemis-desktop/application';

export class GetCountySchoolsUiQuery {
  constructor(private readonly county: CountyApplicationService) {}

  execute(): Promise<ApplicationResponse<CountySchoolsOutput>> {
    return this.county.listSchools();
  }
}
