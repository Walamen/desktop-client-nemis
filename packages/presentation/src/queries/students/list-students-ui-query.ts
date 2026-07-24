import type {
  ApplicationResponse,
  PagedResult,
  ListStudentsDto,
  StudentApplicationService,
  StudentSummaryOutput,
} from '@nemis-desktop/application';

/** Read model for the students list. Grows presentation-side shaping (server
 * search, projection) without touching ViewModels. */
export class ListStudentsUiQuery {
  constructor(private readonly students: StudentApplicationService) {}

  execute(page: ListStudentsDto): Promise<ApplicationResponse<PagedResult<StudentSummaryOutput>>> {
    return this.students.list(page);
  }
}
