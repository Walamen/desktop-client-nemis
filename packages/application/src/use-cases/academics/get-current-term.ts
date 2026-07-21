import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { TermOutput } from '../../dto/academics/academics-dto';
import type { ITermRepository } from '../../interfaces/academics/term-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toTermOutput } from '../../mappers/academics/term-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCurrentTermDeps {
  terms: ITermRepository;
  logger: IAppLogger;
}

export class GetCurrentTermUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<TermOutput | null>
> {
  constructor(private readonly deps: GetCurrentTermDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<TermOutput | null>> {
    return invokeUseCase('GetCurrentTerm', this.deps.logger, async () => {
      const term = this.deps.terms.findCurrent();
      return ok(term ? toTermOutput(term) : null);
    });
  }
}
