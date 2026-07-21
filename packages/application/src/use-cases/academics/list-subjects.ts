import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { PagedResult } from '../../core/pagination';
import type { ListSubjectsDto, SubjectOutput } from '../../dto/academics/academics-dto';
import type { ISubjectRepository } from '../../interfaces/academics/subject-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toSubjectOutput } from '../../mappers/academics/subject-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface ListSubjectsDeps {
  subjects: ISubjectRepository;
  logger: IAppLogger;
}

export class ListSubjectsUseCase implements QueryHandler<
  ListSubjectsDto,
  ApplicationResponse<PagedResult<SubjectOutput>>
> {
  constructor(private readonly deps: ListSubjectsDeps) {}

  execute(query: ListSubjectsDto): Promise<ApplicationResponse<PagedResult<SubjectOutput>>> {
    return invokeUseCase('ListSubjects', this.deps.logger, async () => {
      const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
      const offset = Math.max(query.offset ?? 0, 0);
      const keyword = query.keyword?.trim() || undefined;
      const { items, total } = this.deps.subjects.findPage({
        limit,
        offset,
        keyword,
        includeInactive: query.includeInactive,
        sort: query.sort,
      });
      const mapped = items.map((subject) =>
        toSubjectOutput(subject, this.deps.subjects.countClasses(subject.id)),
      );
      return ok({ items: mapped, total, limit, offset });
    });
  }
}
