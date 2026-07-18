import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { PagedResult } from '../../core/pagination';
import type { ListStudentsDto, StudentSummaryOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentSummary } from '../../mappers/students/student-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface ListStudentsDeps {
  students: IStudentRepository;
  logger: IAppLogger;
}

export class ListStudentsUseCase
  implements QueryHandler<ListStudentsDto, ApplicationResponse<PagedResult<StudentSummaryOutput>>>
{
  constructor(private readonly deps: ListStudentsDeps) {}

  execute(
    query: ListStudentsDto,
  ): Promise<ApplicationResponse<PagedResult<StudentSummaryOutput>>> {
    return invokeUseCase('ListStudents', this.deps.logger, async () => {
      const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
      const offset = Math.max(query.offset ?? 0, 0);
      const { items, total } = this.deps.students.findPage({ limit, offset });
      return ok({ items: items.map(toStudentSummary), total, limit, offset });
    });
  }
}
