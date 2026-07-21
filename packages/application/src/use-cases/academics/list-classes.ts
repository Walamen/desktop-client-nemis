import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { PagedResult } from '../../core/pagination';
import type { ClassOutput, ListClassesDto } from '../../dto/academics/academics-dto';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toClassOutput } from '../../mappers/academics/class-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface ListClassesDeps {
  classes: IClassRepository;
  logger: IAppLogger;
}

export class ListClassesUseCase implements QueryHandler<
  ListClassesDto,
  ApplicationResponse<PagedResult<ClassOutput>>
> {
  constructor(private readonly deps: ListClassesDeps) {}

  execute(query: ListClassesDto): Promise<ApplicationResponse<PagedResult<ClassOutput>>> {
    return invokeUseCase('ListClasses', this.deps.logger, async () => {
      const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
      const offset = Math.max(query.offset ?? 0, 0);
      const keyword = query.keyword?.trim() || undefined;
      const { items, total } = this.deps.classes.findPage({
        limit,
        offset,
        keyword,
        academicYearId: query.academicYearId,
        gradeLevel: query.gradeLevel,
        includeInactive: query.includeInactive,
        sort: query.sort,
      });
      const mapped = items.map((entity) =>
        toClassOutput(entity, this.deps.classes.countSubjects(entity.id)),
      );
      return ok({ items: mapped, total, limit, offset });
    });
  }
}
