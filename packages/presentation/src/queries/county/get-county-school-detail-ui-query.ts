import type {
  ApplicationResponse,
  CountyApplicationService,
  CountySchoolDetailOutput,
} from '@nemis-desktop/application';

export class GetCountySchoolDetailUiQuery {
  constructor(private readonly county: CountyApplicationService) {}

  execute(schoolId: string): Promise<ApplicationResponse<CountySchoolDetailOutput>> {
    return this.county.getSchool(schoolId);
  }
}
