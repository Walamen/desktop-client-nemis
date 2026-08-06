import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { AssignmentOutput, GetAssignmentDto } from '../../dto/assignments/assignment-dto';
import type { IAssignmentRepository } from '../../interfaces/assignments/assignment-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { PermissionDeniedException, WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetAssignmentDeps {
  assignments: IAssignmentRepository;
  logger: IAppLogger;
}

export class GetAssignmentUseCase
  implements QueryHandler<GetAssignmentDto, ApplicationResponse<AssignmentOutput | null>>
{
  constructor(private readonly deps: GetAssignmentDeps) {}

  execute(query: GetAssignmentDto): Promise<ApplicationResponse<AssignmentOutput | null>> {
    return invokeUseCase('GetAssignment', this.deps.logger, async () => {
      const detail = this.deps.assignments.getDetail(query.id);
      if (!detail) throw new WorkflowException(`Assignment ${query.id} does not exist.`);
      if (detail.teacherId !== query.teacherId) {
        throw new PermissionDeniedException('You do not own this assignment.');
      }
      return ok(detail);
    });
  }
}
