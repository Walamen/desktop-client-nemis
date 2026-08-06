import type {
  ApplicationResponse,
  AssignmentOutput,
  AssignmentsApplicationService,
  ListAssignmentsDto,
} from '@nemis-desktop/application';

export class ListAssignmentsUiQuery {
  constructor(private readonly assignments: AssignmentsApplicationService) {}

  execute(dto: ListAssignmentsDto): Promise<ApplicationResponse<AssignmentOutput[]>> {
    return this.assignments.list(dto);
  }
}
