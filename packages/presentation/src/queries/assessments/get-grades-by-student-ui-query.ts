import type {
  ApplicationResponse,
  AssessmentsApplicationService,
  GradeOutput,
} from '@nemis-desktop/application';

export class GetGradesByStudentUiQuery {
  constructor(private readonly assessments: AssessmentsApplicationService) {}

  execute(studentId: string): Promise<ApplicationResponse<GradeOutput[]>> {
    return this.assessments.getGradesByStudent({ studentId });
  }
}
