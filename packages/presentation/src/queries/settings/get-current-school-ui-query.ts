import type { ApplicationResponse, InstitutionApplicationService, InstitutionProfileOutput } from '@nemis-desktop/application';

export class GetCurrentSchoolUiQuery {
  constructor(private readonly institution: InstitutionApplicationService) {}
  execute(): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return this.institution.getCurrentSchool();
  }
}
