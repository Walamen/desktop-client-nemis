import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { GradeLevelCountOutput } from '../../dto/academics/academics-dto';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetGradeLevelCountsDeps {
  classes: IClassRepository;
  logger: IAppLogger;
}

export class GetGradeLevelCountsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<GradeLevelCountOutput[]>
> {
  constructor(private readonly deps: GetGradeLevelCountsDeps) {}

  execute(
    _query: Record<string, never>,
  ): Promise<ApplicationResponse<GradeLevelCountOutput[]>> {
    return invokeUseCase('GetGradeLevelCounts', this.deps.logger, async () => {
      return ok(this.deps.classes.countByGradeLevel());
    });
  }
}
