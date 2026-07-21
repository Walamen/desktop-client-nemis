import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ListTermsDto, TermOutput } from '../../dto/academics/academics-dto';
import type { ITermRepository } from '../../interfaces/academics/term-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toTermOutput } from '../../mappers/academics/term-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface ListTermsDeps {
  terms: ITermRepository;
  logger: IAppLogger;
}

export class ListTermsUseCase implements QueryHandler<
  ListTermsDto,
  ApplicationResponse<TermOutput[]>
> {
  constructor(private readonly deps: ListTermsDeps) {}

  execute(query: ListTermsDto): Promise<ApplicationResponse<TermOutput[]>> {
    return invokeUseCase('ListTerms', this.deps.logger, async () => {
      const terms = this.deps.terms.findByYear(query.academicYearId).map(toTermOutput);
      return ok(terms);
    });
  }
}
