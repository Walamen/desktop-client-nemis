import type {
  ApplicationResponse,
  InstitutionApplicationService,
  InstitutionSummaryOutput,
} from '@nemis-desktop/application';

/** Read model for the County/DEO/Ministry Schools list. */
export class ListInstitutionsUiQuery {
  constructor(private readonly institution: InstitutionApplicationService) {}

  execute(): Promise<ApplicationResponse<InstitutionSummaryOutput[]>> {
    return this.institution.listInstitutions();
  }
}
