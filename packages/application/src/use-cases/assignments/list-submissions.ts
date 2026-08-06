import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  AssignmentSubmissionOutput,
  ListSubmissionsDto,
} from '../../dto/assignments/assignment-dto';
import type { IAssignmentRepository } from '../../interfaces/assignments/assignment-repository';
import type { IAssignmentSubmissionRepository } from '../../interfaces/assignments/assignment-submission-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { PermissionDeniedException, WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface ListSubmissionsDeps {
  assignments: IAssignmentRepository;
  submissions: IAssignmentSubmissionRepository;
  logger: IAppLogger;
}

export class ListSubmissionsUseCase
  implements QueryHandler<ListSubmissionsDto, ApplicationResponse<AssignmentSubmissionOutput[]>>
{
  constructor(private readonly deps: ListSubmissionsDeps) {}

  execute(query: ListSubmissionsDto): Promise<ApplicationResponse<AssignmentSubmissionOutput[]>> {
    return invokeUseCase('ListSubmissions', this.deps.logger, async () => {
      const assignment = this.deps.assignments.findById(query.assignmentId);
      if (!assignment) throw new WorkflowException(`Assignment ${query.assignmentId} does not exist.`);
      if (assignment.teacherId !== query.teacherId) {
        throw new PermissionDeniedException('You do not own this assignment.');
      }
      return ok(this.deps.submissions.listByAssignment(query.assignmentId));
    });
  }
}
