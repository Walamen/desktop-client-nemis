import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { AssignmentOutput, ListAssignmentsDto } from '../../dto/assignments/assignment-dto';
import type { IAssignmentRepository } from '../../interfaces/assignments/assignment-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface ListAssignmentsDeps {
  assignments: IAssignmentRepository;
  logger: IAppLogger;
}

export class ListAssignmentsUseCase
  implements QueryHandler<ListAssignmentsDto, ApplicationResponse<AssignmentOutput[]>>
{
  constructor(private readonly deps: ListAssignmentsDeps) {}

  execute(query: ListAssignmentsDto): Promise<ApplicationResponse<AssignmentOutput[]>> {
    return invokeUseCase('ListAssignments', this.deps.logger, async () => {
      const rows = this.deps.assignments.list({
        teacherId: query.teacherId,
        classId: query.classId,
        status: query.status,
      });
      return ok(rows);
    });
  }
}
