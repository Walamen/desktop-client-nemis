import type {
  ApplicationResponse,
  InstitutionApplicationService,
  InstitutionProfileOutput,
} from '@nemis-desktop/application';

export class GetInstitutionProfileUiQuery {
  constructor(private readonly institution: InstitutionApplicationService) {}

  execute(institutionId: string): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return this.institution.getProfile({ institutionId });
  }
}
