import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { InstitutionProfileOutput } from '../../dto/institution/institution-dto';
import type { IInstitutionRepository } from '../../interfaces/institution/institution-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toInstitutionProfileOutput } from '../../mappers/institution/institution-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetInstitutionProfileDeps {
  institutions: IInstitutionRepository;
  logger: IAppLogger;
}

export class GetInstitutionProfileUseCase
  implements
    QueryHandler<{ institutionId: string }, ApplicationResponse<InstitutionProfileOutput | null>>
{
  constructor(private readonly deps: GetInstitutionProfileDeps) {}

  execute(
    query: { institutionId: string },
  ): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return invokeUseCase('GetInstitutionProfile', this.deps.logger, async () => {
      const institution = this.deps.institutions.findById(query.institutionId);
      return ok(institution ? toInstitutionProfileOutput(institution) : null);
    });
  }
}
