import type {
  ApplicationResponse,
  AssignmentOutput,
  AssignmentsApplicationService,
  GetAssignmentDto,
} from '@nemis-desktop/application';

export class GetAssignmentUiQuery {
  constructor(private readonly assignments: AssignmentsApplicationService) {}

  execute(dto: GetAssignmentDto): Promise<ApplicationResponse<AssignmentOutput | null>> {
    return this.assignments.get(dto);
  }
}
