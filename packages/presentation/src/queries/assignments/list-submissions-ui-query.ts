import type {
  ApplicationResponse,
  AssignmentSubmissionOutput,
  AssignmentsApplicationService,
  ListSubmissionsDto,
} from '@nemis-desktop/application';

export class ListSubmissionsUiQuery {
  constructor(private readonly assignments: AssignmentsApplicationService) {}

  execute(dto: ListSubmissionsDto): Promise<ApplicationResponse<AssignmentSubmissionOutput[]>> {
    return this.assignments.listSubmissions(dto);
  }
}
