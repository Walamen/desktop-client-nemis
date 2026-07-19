import type {
  AcademicsApplicationService,
  ApplicationResponse,
  ClassRosterOutput,
} from '@nemis-desktop/application';

export class GetClassRosterUiQuery {
  constructor(private readonly academics: AcademicsApplicationService) {}

  execute(classId: string): Promise<ApplicationResponse<ClassRosterOutput>> {
    return this.academics.getClassRoster({ classId });
  }
}
