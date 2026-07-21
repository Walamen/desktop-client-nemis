import type { AcademicsApplicationService, AcademicYearOutput, ApplicationResponse } from '@nemis-desktop/application';

export class GetCurrentAcademicYearUiQuery {
  constructor(private readonly academics: AcademicsApplicationService) {}
  execute(): Promise<ApplicationResponse<AcademicYearOutput | null>> {
    return this.academics.getCurrentAcademicYear();
  }
}
